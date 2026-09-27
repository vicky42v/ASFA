"""
ASFA Rule Engine
================
Centralized, safe rule evaluation engine for academic scheduling.
Separates HARD constraints from SOFT optimization preferences,
evaluates hierarchical rule scopes (GLOBAL -> DEPARTMENT -> SCHEME -> SEMESTER -> SUBJECT -> FACULTY),
and decouples academic credits from timetable periods.
"""

import json
from collections import defaultdict
from typing import Dict, Any, List, Optional, Tuple

from backend.db import rows, row, execute


# Rule Scope Priority Order (higher specificity overrides lower specificity)
SCOPE_SPECIFICITY = {
    "GLOBAL": 1,
    "DEPARTMENT": 2,
    "SCHEME": 3,
    "ACADEMIC_YEAR": 4,
    "SEMESTER": 5,
    "SUBJECT_GROUP": 6,
    "SUBJECT": 7,
    "FACULTY": 8,
    "ACTIVITY_TYPE": 5,
}

# Designation workload fallbacks (if rule not configured)
DEFAULT_WORKLOAD_LIMITS = {
    "Assistant Professor": (16, 18),
    "Associate Professor": (14, 16),
    "Professor": (14, 16),
    "HOD": (8, 12),
    "Principal": (2, 6),
}


def _safe_json(val, default=None):
    if val is None:
        return default or {}
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default or {}


class AsfaRuleEngine:
    def __init__(self, context: Optional[Dict[str, Any]] = None):
        self.context = context or {}
        self._rules = []
        self._hard_rules = []
        self._soft_rules = []
        self._workload_rules = {}
        self._preferences = {}
        self.reload_rules()

    def reload_rules(self):
        """Fetch all active rules matching current context."""
        query = "SELECT * FROM asfa_rule WHERE is_enabled = 1 ORDER BY priority DESC, rule_id ASC"
        all_rules = rows(query, ())
        
        self._rules = []
        self._hard_rules = []
        self._soft_rules = []

        for r in all_rules:
            r["rule_value"] = _safe_json(r.get("rule_value"))
            # Check scope applicability
            if self._rule_applies(r):
                self._rules.append(r)
                if r.get("rule_type") == "HARD":
                    self._hard_rules.append(r)
                else:
                    self._soft_rules.append(r)

    def _rule_applies(self, rule: Dict[str, Any]) -> bool:
        """Check if rule matches the engine's current academic context."""
        scope = rule.get("scope", "GLOBAL")
        if scope == "GLOBAL":
            return True

        if not self.context:
            return True

        dept_id = self.context.get("department_id")
        scheme_id = self.context.get("scheme_id")
        sem_id = self.context.get("semester_id")
        sem_no = self.context.get("semester_no")

        if scope == "DEPARTMENT" and rule.get("department_id"):
            if str(rule["department_id"]) != str(dept_id):
                return False

        if scope == "SCHEME" and rule.get("scheme_id"):
            if str(rule["scheme_id"]) != str(scheme_id):
                return False

        if scope == "SEMESTER":
            if rule.get("semester_id") and str(rule["semester_id"]) != str(sem_id):
                return False
            # Check condition_expr for semester_no
            cond = str(rule.get("condition_expr") or "")
            if sem_no is not None:
                if "semester_no == 7" in cond and int(sem_no) != 7:
                    return False
                if "semester_no >= 7" in cond and int(sem_no) < 7:
                    return False

        return True

    def get_hard_rules(self) -> List[Dict[str, Any]]:
        return self._hard_rules

    def get_soft_rules(self) -> List[Dict[str, Any]]:
        return self._soft_rules

    def is_rule_enabled(self, rule_code: str) -> bool:
        """Check if a specific rule code is active and enabled."""
        for r in self._rules:
            if r.get("rule_code") == rule_code:
                return bool(r.get("is_enabled", True))
        return False

    def get_rule(self, rule_code: str) -> Optional[Dict[str, Any]]:
        for r in self._rules:
            if r.get("rule_code") == rule_code:
                return r
        return None

    def get_rule_value(self, rule_code: str, default: Any = None) -> Any:
        r = self.get_rule(rule_code)
        if r and r.get("rule_value") is not None:
            return r.get("rule_value")
        return default

    def should_disallow_classes_after_specials(self) -> bool:
        """Whether regular academic classes should be blocked after Project/Activity/Proctor."""
        if self.is_rule_enabled("RULE_END_OF_DAY_SPECIAL_ACTIVITIES"):
            val = self.get_rule_value("RULE_END_OF_DAY_SPECIAL_ACTIVITIES", {})
            return bool(val.get("disallow_regular_after", True))
        return True

    def get_late_afternoon_special_periods(self) -> List[int]:
        """Periods targeted for Project, Activity, and Proctor (default [6, 7])."""
        val = self.get_rule_value("RULE_LATE_AFTERNOON_SPECIAL_SESSIONS", {})
        return val.get("target_periods", [6, 7])

    def get_max_consecutive_teaching_hours(self) -> int:
        if self.is_rule_enabled("RULE_FACULTY_MAX_CONTINUOUS_TEACHING"):
            val = self.get_rule_value("RULE_FACULTY_MAX_CONTINUOUS_TEACHING", {})
            return int(val.get("max_consecutive_hours", 2))
        return 2

    def get_max_labs_per_week(self) -> int:
        if self.is_rule_enabled("RULE_MAX_LABS_PER_WEEK"):
            val = self.get_rule_value("RULE_MAX_LABS_PER_WEEK", {})
            return int(val.get("max_labs_per_week", 3))
        return 3

    # ============================================================
    # 1. FACULTY WORKLOAD BOUNDS
    # ============================================================
    def get_faculty_workload_bounds(self, faculty: Dict[str, Any]) -> Tuple[int, int]:
        """
        Return (min_hours, max_hours) for a faculty member.
        Checks explicit faculty table config, then active ASFA WORKLOAD rules,
        then designation fallback policy.
        """
        conf_min = int(faculty.get("min_workload") or 0)
        conf_max = int(faculty.get("max_workload") or 0)
        if conf_max > 0:
            return conf_min, conf_max

        designation = str(faculty.get("designation") or "").strip().lower()
        role = str(faculty.get("role") or "").strip().lower()

        # Check for workload rule override
        workload_rules = [r for r in self._rules if r.get("category") == "WORKLOAD"]
        table_limits = DEFAULT_WORKLOAD_LIMITS.copy()
        if workload_rules:
            # Most specific or highest priority rule
            val = workload_rules[0].get("rule_value") or {}
            for k, v in val.items():
                if isinstance(v, (list, tuple)) and len(v) == 2:
                    table_limits[k] = (int(v[0]), int(v[1]))

        # Principal
        if "principal" in designation or "principal" in role:
            return table_limits.get("Principal", (2, 6))

        # HOD
        if role == "hod" or "hod" in designation or "head of" in designation:
            return table_limits.get("HOD", (8, 12))

        # Assistant Professor
        if "assistant professor" in designation:
            return table_limits.get("Assistant Professor", (16, 18))

        # Associate Professor
        if "associate professor" in designation:
            return table_limits.get("Associate Professor", (14, 16))

        # Professor
        if designation == "professor" or designation.startswith("professor "):
            return table_limits.get("Professor", (14, 16))

        return (conf_min, conf_max if conf_max > 0 else 18)

    # ============================================================
    # 2. SUBJECT SCHEDULING CLASSIFICATION & PRIORITY
    # ============================================================
    def get_subject_config(self, subject: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get subject scheduling classification, priority, and period limits.
        Decouples academic credits from normal weekly timetable periods.
        """
        sid = int(subject.get("subject_id") or 0)
        if not hasattr(self, "_subject_configs"):
            self._subject_configs = {}

        if sid in self._subject_configs:
            return self._subject_configs[sid]

        cfg = row(
            "SELECT * FROM subject_scheduling_config WHERE subject_id = %s",
            (sid,)
        )

        if cfg:
            res = {
                "classification": cfg.get("classification", "CORE_THEORY"),
                "scheduling_priority": cfg.get("scheduling_priority", "NORMAL"),
                "scheduling_weight": int(cfg.get("scheduling_weight") or 50),
                "max_weekly_periods": cfg.get("max_weekly_periods"),
                "consecutive_periods": int(cfg.get("consecutive_periods") or 1),
            }
            self._subject_configs[sid] = res
            return res

        # Safe fallback based on category & name
        cat = str(subject.get("course_category") or "").strip().upper()
        name = str(subject.get("subject_name") or "").lower()
        code = str(subject.get("subject_code") or "").lower()
        p = int(subject.get("practical_hours") or 0)
        l = int(subject.get("lecture_hours") or 0)

        if (cat in ("PROJ", "PROJECT") or "project" in name or "project" in code) and "management" not in name:
            return {
                "classification": "PROJECT",
                "scheduling_priority": "LOW",
                "scheduling_weight": 30,
                "max_weekly_periods": 4,
                "consecutive_periods": 2,
            }
        if "remedial" in name or "remedial" in code:
            return {
                "classification": "REMEDIAL",
                "scheduling_priority": "LOW",
                "scheduling_weight": 20,
                "max_weekly_periods": 2,
                "consecutive_periods": 1,
            }
        if "placement" in name or "placement" in code or "training" in name:
            return {
                "classification": "PLACEMENT",
                "scheduling_priority": "LOW",
                "scheduling_weight": 25,
                "max_weekly_periods": 2,
                "consecutive_periods": 1,
            }
        if "proctor" in name or "proctor" in code:
            return {
                "classification": "PROCTOR",
                "scheduling_priority": "NORMAL",
                "scheduling_weight": 50,
                "max_weekly_periods": 1,
                "consecutive_periods": 1,
            }
        if p > 0 and l == 0:
            return {
                "classification": "LAB",
                "scheduling_priority": "NORMAL",
                "scheduling_weight": 60,
                "max_weekly_periods": None,
                "consecutive_periods": 2,
            }
        if cat in ("PEC", "OEC"):
            return {
                "classification": "ELECTIVE",
                "scheduling_priority": "NORMAL",
                "scheduling_weight": 50,
                "max_weekly_periods": None,
                "consecutive_periods": 1,
            }

        return {
            "classification": "CORE_THEORY",
            "scheduling_priority": "HIGH" if (p > 0 and l > 0) else "NORMAL",
            "scheduling_weight": 70 if (p > 0 and l > 0) else 50,
            "max_weekly_periods": None,
            "consecutive_periods": 1,
        }

    # ============================================================
    # 3. SEMESTER 7 LOW-PRIORITY ACTIVITY CAP
    # ============================================================
    def get_sem7_low_priority_cap(self) -> int:
        """
        Return maximum low-priority activity periods for Semester 7 (default 5).
        Configurable via ASFA rule 'RULE_SEM7_LOW_PRIORITY_CAP'.
        """
        for r in self._rules:
            if r.get("category") == "ACTIVITY_LIMIT":
                val = r.get("rule_value") or {}
                if "max_periods" in val:
                    return int(val["max_periods"])
        return 5

    # ============================================================
    # 4. SEMESTER 7 ACTIVITY REPLACEMENT RULE
    # ============================================================
    def is_activity_replaced_in_curriculum(self, subject: Dict[str, Any]) -> bool:
        """
        Checks if Physical Education / NCC / Yoga is replaced by Project/Placement
        for Semester 7 and later curriculum structures.
        """
        sem_no = int(self.context.get("semester_no") or 0)
        if sem_no < 7:
            return False

        name = str(subject.get("subject_name") or "").upper()
        code = str(subject.get("subject_code") or "").upper()

        replace_targets = {"PE", "PHYSICAL EDUCATION", "NCC", "YOGA", "NSS", "MUSIC"}
        for r in self._rules:
            if r.get("category") == "ACTIVITY_REPLACEMENT":
                val = r.get("rule_value") or {}
                targets = val.get("replace") or []
                if targets:
                    replace_targets = {str(t).upper() for t in targets}
                break

        import re
        name_tokens = set(re.findall(r'\b[A-Z0-9]+\b', name))
        for target in replace_targets:
            if " " in target:
                if re.search(r'\b' + re.escape(target) + r'\b', name):
                    return True
            else:
                if target in name_tokens or target == code:
                    return True
        return False

    # ============================================================
    # 5. MANDATORY PROCTOR HOUR RULE
    # ============================================================
    def get_proctor_rule_hours(self) -> int:
        """
        Return mandatory proctor hours per week for the semester.
        Default is 1 unless disabled.
        """
        for r in self._rules:
            if r.get("category") == "PROCTOR":
                if not r.get("is_enabled", True):
                    return 0
                val = r.get("rule_value") or {}
                return int(val.get("hours_per_week", 1))
        return 1

    # ============================================================
    # 6. FACULTY TIME PREFERENCES (SOFT CONSTRAINT)
    # ============================================================
    def get_faculty_preference(self, faculty_id: int, academic_year: str = "2026-27") -> Dict[str, Any]:
        """
        Return faculty preference: Preferred Time ('Morning', 'Evening', 'No_Preference')
        and priority percentage (0-100%).
        """
        pref = row(
            """
            SELECT * FROM faculty_preference
            WHERE faculty_id = %s AND academic_year = %s
            LIMIT 1
            """,
            (faculty_id, academic_year)
        )
        if pref:
            return {
                "preferred_time": pref.get("preferred_time", "No_Preference"),
                "priority_percentage": int(pref.get("priority_percentage") or 75),
            }
        return {
            "preferred_time": "No_Preference",
            "priority_percentage": 0,
        }

    def evaluate_preference_score(self, faculty_id: int, period: int, periods_per_day: int = 7) -> float:
        """
        Calculate satisfaction score for a faculty member in a given period.
        Periods 1..mid -> Morning.
        Periods mid+1..end -> Evening.
        Returns a score penalty from 0.0 (fully satisfied) to 1.0 (strongly dissatisfied).
        """
        pref = self.get_faculty_preference(faculty_id, self.context.get("academic_year", "2026-27"))
        preferred_time = pref.get("preferred_time", "No_Preference")
        priority = pref.get("priority_percentage", 0) / 100.0

        if preferred_time == "No_Preference" or priority <= 0:
            return 0.0

        mid = 4 if periods_per_day >= 7 else (periods_per_day // 2)
        is_morning = period <= mid

        if preferred_time == "Morning" and not is_morning:
            return 1.0 * priority
        elif preferred_time == "Evening" and is_morning:
            return 1.0 * priority
        return 0.0
