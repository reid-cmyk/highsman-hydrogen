// Customer Issue Reporting module
// Stores issues in localStorage; designed for future Exec Team dashboard integration

const Issues = (() => {
  const STORAGE_KEY = 'hs_issues_v1';

  const ISSUE_TYPES = [
    'Product Quality',
    'Delivery Problem',
    'Wrong Order',
    'Pricing Dispute',
    'Out of Stock',
    'Account Relationship',
    'Other',
  ];

  const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

  // Lower number = higher priority (used for sort)
  const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  let _issues = [];
  let _nextId = 1;

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _issues = parsed.issues || [];
        _nextId  = parsed.nextId  || 1;
      }
    } catch (e) {}
  }

  function _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ issues: _issues, nextId: _nextId }));
  }

  function _ticketId(n) {
    return 'ISS-' + String(n).padStart(4, '0');
  }

  function init() { _load(); }

  // Create and persist a new issue. Returns the issue object.
  function create(data) {
    const issue = {
      ticketId:        _ticketId(_nextId++),
      accountId:       data.accountId       || '',
      accountName:     data.accountName     || '',
      contactName:     data.contactName     || '',
      type:            data.type            || '',
      severity:        data.severity        || 'Medium',
      description:     data.description     || '',
      date:            data.date            || new Date().toISOString().split('T')[0],
      reporter:        data.reporter        || '',
      status:          'Open',
      resolutionNotes: '',
      resolvedAt:      null,
      // escalated = true flags this for the future Exec Team dashboard
      escalated:       ['High', 'Critical'].includes(data.severity),
      timestamp:       new Date().toISOString(),
    };
    _issues.unshift(issue);
    _save();
    return issue;
  }

  // Mark an issue resolved; returns the updated issue.
  function resolve(ticketId) {
    const issue = _issues.find(i => i.ticketId === ticketId);
    if (issue && issue.status !== 'Resolved') {
      issue.status    = 'Resolved';
      issue.resolvedAt = new Date().toISOString();
      _save();
    }
    return issue;
  }

  function getAll() { return [..._issues]; }

  function counts() {
    const open     = _issues.filter(i => i.status !== 'Resolved').length;
    const critical = _issues.filter(i => i.severity === 'Critical' && i.status !== 'Resolved').length;
    const high     = _issues.filter(i => i.severity === 'High'     && i.status !== 'Resolved').length;
    return { open, critical, high, total: _issues.length };
  }

  // Post a note to the Zoho CRM account record (best-effort, silent on failure)
  async function flagInZoho(issue) {
    if (!Zoho.isConnected()) return;
    const token = Zoho.getToken();
    if (!token || !issue.accountId) return;
    try {
      const noteBody = {
        data: [{
          Note_Title:   `[${issue.ticketId}] ${issue.type} — ${issue.severity}`,
          Note_Content: [
            `Ticket:      ${issue.ticketId}`,
            `Type:        ${issue.type}`,
            `Severity:    ${issue.severity}`,
            `Contact:     ${issue.contactName || 'N/A'}`,
            `Description: ${issue.description}`,
            `Reported by: ${issue.reporter}`,
            `Date:        ${issue.date}`,
            `Escalated:   ${issue.escalated ? 'Yes' : 'No'}`,
          ].join('\n'),
          Parent_Id:  issue.accountId,
          se_module:  'Accounts',
        }],
      };
      await fetch('https://www.zohoapis.com/crm/v3/Notes', {
        method:  'POST',
        headers: {
          Authorization:  `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteBody),
      });
    } catch (e) { /* best-effort */ }
  }

  return {
    ISSUE_TYPES, SEVERITIES, SEVERITY_ORDER,
    init, create, resolve, getAll, counts, flagInZoho,
  };
})();
