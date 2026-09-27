import React, { useState, useEffect } from 'react';
import {
  Shield,
  Plus,
  Search,
  Filter,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit2,
  X,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { asfaApi } from '../services/api';

export default function AsfaRulesScreen() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Add rule form state
  const [newRule, setNewRule] = useState({
    rule_name: '',
    rule_code: '',
    category: 'WORKLOAD',
    rule_type: 'HARD',
    scope: 'GLOBAL',
    priority: 50,
    description: '',
    condition_expr: '',
    is_enabled: true,
  });

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await asfaApi.getRules();
      if (res?.rules) {
        setRules(res.rules);
      }
    } catch (e) {
      console.error('Failed to load rules:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleToggleRule = async (rule) => {
    try {
      const newEnabled = !rule.is_enabled;
      await asfaApi.updateRule(rule.rule_id, {
        is_enabled: newEnabled,
      });
      setRules((prev) =>
        prev.map((r) =>
          r.rule_id === rule.rule_id ? { ...r, is_enabled: newEnabled } : r
        )
      );
      setMessage(`Rule "${rule.rule_name}" ${newEnabled ? 'enabled' : 'disabled'}.`);
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      alert(`Failed to update rule: ${e.message}`);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    try {
      await asfaApi.deleteRule(ruleId);
      setRules((prev) => prev.filter((r) => r.rule_id !== ruleId));
      setMessage('Rule deleted successfully.');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      alert(`Failed to delete rule: ${e.message}`);
    }
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    if (!newRule.rule_name.trim()) {
      alert('Please enter a rule name.');
      return;
    }

    setSaving(true);
    try {
      const code =
        newRule.rule_code.trim() ||
        `RULE_CUSTOM_${newRule.rule_name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 24)}`;

      await asfaApi.createRule({
        ...newRule,
        rule_code: code,
      });

      setIsAddModalOpen(false);
      setNewRule({
        rule_name: '',
        rule_code: '',
        category: 'WORKLOAD',
        rule_type: 'HARD',
        scope: 'GLOBAL',
        priority: 50,
        description: '',
        condition_expr: '',
        is_enabled: true,
      });
      await fetchRules();
      setMessage('New ASFA rule created successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      alert(`Failed to create rule: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const categories = ['ALL', 'WORKLOAD', 'CURRICULUM', 'PREFERENCE', 'SCHEDULING', 'CUSTOM'];

  const filteredRules = rules.filter((r) => {
    if (selectedCategory !== 'ALL' && (r.category || '').toUpperCase() !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        (r.rule_name || '').toLowerCase().includes(q) ||
        (r.rule_code || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* HEADER ROW */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: '800' }}>
            ASFA Scheduling Rules
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
            Configure institutional guidelines, AICTE/VTU constraints, and solver optimization weights.
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={() => setIsAddModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px' }}
        >
          <Plus size={16} />
          Add New Rule
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: '12px 18px',
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '8px',
            color: '#166534',
            fontSize: '0.82rem',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          {message}
        </div>
      )}

      {/* FILTER & SEARCH TOOLBAR */}
      <div
        className="skit-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`btn-secondary ${selectedCategory === cat ? 'active' : ''}`}
              style={{
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontWeight: '700',
                background: selectedCategory === cat ? 'var(--primary)' : '#FFFFFF',
                color: selectedCategory === cat ? '#FFFFFF' : '#475569',
                borderColor: selectedCategory === cat ? 'var(--primary)' : '#E2E8F0',
              }}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', minWidth: '260px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94A3B8',
            }}
          />
          <input
            type="text"
            className="form-input"
            placeholder="Search rules..."
            style={{ paddingLeft: '36px', fontSize: '0.8rem' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* RULES TABLE */}
      <div className="skit-card" style={{ padding: '0', overflow: 'hidden' }}>
        <table className="skit-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '60px' }}>STATUS</th>
              <th>RULE NAME & CODE</th>
              <th>CATEGORY</th>
              <th>TYPE</th>
              <th>PRIORITY</th>
              <th>SCOPE</th>
              <th>DESCRIPTION</th>
              <th style={{ textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                  Loading ASFA rules...
                </td>
              </tr>
            ) : filteredRules.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                  No rules found for the selected filter. Click "Add New Rule" to create one.
                </td>
              </tr>
            ) : (
              filteredRules.map((rule) => (
                <tr key={rule.rule_id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggleRule(rule)}
                      style={{
                        width: '40px',
                        height: '22px',
                        borderRadius: '99px',
                        border: 'none',
                        background: rule.is_enabled ? '#16A34A' : '#CBD5E1',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        padding: 0,
                      }}
                      title={rule.is_enabled ? 'Click to Disable' : 'Click to Enable'}
                    >
                      <span
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: '#FFFFFF',
                          position: 'absolute',
                          top: '3px',
                          left: rule.is_enabled ? '21px' : '3px',
                          transition: 'left 0.2s',
                        }}
                      />
                    </button>
                  </td>
                  <td>
                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.85rem' }}>
                      {rule.rule_name}
                    </div>
                    <code style={{ fontSize: '0.68rem', color: '#64748B' }}>
                      {rule.rule_code}
                    </code>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: '#F1F5F9',
                        color: '#475569',
                        fontWeight: '800',
                      }}
                    >
                      {rule.category}
                    </span>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: rule.rule_type === 'HARD' ? '#FEF2F2' : '#F0FDF4',
                        color: rule.rule_type === 'HARD' ? '#DC2626' : '#15803D',
                        fontWeight: '800',
                      }}
                    >
                      {rule.rule_type}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div
                        style={{
                          width: '60px',
                          height: '6px',
                          background: '#E2E8F0',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${rule.priority}%`,
                            height: '100%',
                            background: rule.priority > 75 ? '#DC2626' : '#16A34A',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: '700' }}>
                        {rule.priority}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>
                      {rule.scope}
                    </span>
                  </td>
                  <td style={{ maxWidth: '300px', fontSize: '0.76rem', color: '#475569' }}>
                    {rule.description || '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{
                        padding: '5px 10px',
                        fontSize: '0.72rem',
                        color: '#DC2626',
                        borderColor: '#FCA5A5',
                      }}
                      onClick={() => handleDeleteRule(rule.rule_id)}
                      title="Delete Rule"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ADD NEW RULE MODAL */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            className="skit-card"
            style={{
              width: '100%',
              maxWidth: '560px',
              padding: '26px',
              borderRadius: '12px',
              background: '#FFFFFF',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: '#ECFDF5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Shield size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800' }}>
                  Add New ASFA Rule
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRule} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '0.8rem' }}>
                  Rule Name *
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Senior Faculty Afternoon Exemption"
                  required
                  value={newRule.rule_name}
                  onChange={(e) => setNewRule({ ...newRule, rule_name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.8rem' }}>
                    Category
                  </label>
                  <select
                    className="form-select"
                    value={newRule.category}
                    onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                  >
                    <option value="WORKLOAD">WORKLOAD</option>
                    <option value="CURRICULUM">CURRICULUM</option>
                    <option value="PREFERENCE">PREFERENCE</option>
                    <option value="SCHEDULING">SCHEDULING</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.8rem' }}>
                    Constraint Type
                  </label>
                  <select
                    className="form-select"
                    value={newRule.rule_type}
                    onChange={(e) => setNewRule({ ...newRule, rule_type: e.target.value })}
                  >
                    <option value="HARD">HARD (Zero Tolerance)</option>
                    <option value="SOFT">SOFT (Optimization Preference)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.8rem' }}>
                    Scope
                  </label>
                  <select
                    className="form-select"
                    value={newRule.scope}
                    onChange={(e) => setNewRule({ ...newRule, scope: e.target.value })}
                  >
                    <option value="GLOBAL">GLOBAL</option>
                    <option value="SEMESTER">SEMESTER</option>
                    <option value="DEPARTMENT">DEPARTMENT</option>
                    <option value="FACULTY">FACULTY</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.8rem' }}>
                    Priority Weight (1 - 100)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="form-input"
                    value={newRule.priority}
                    onChange={(e) => setNewRule({ ...newRule, priority: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '0.8rem' }}>
                  Condition Expression (Optional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. max_hours <= 4 or semester_no >= 7"
                  value={newRule.condition_expr}
                  onChange={(e) => setNewRule({ ...newRule, condition_expr: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '0.8rem' }}>
                  Description
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Describe when and why this rule should be applied by the solver..."
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {saving ? 'Saving...' : 'Save & Activate Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
