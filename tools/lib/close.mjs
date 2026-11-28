export function closeArgs(n = '', commit = '', notPlanned = false, reason = '') {
  if (commit && notPlanned) return '--commit and --not-planned are exclusive: an issue is either done or dropped';
  if (notPlanned) {
    if (!reason.trim()) return '--not-planned needs --reason "<one line>": a dropped issue says why';
    if (reason.includes('\n')) return '--reason is one line';
    return ['issue', 'close', n, '--reason', 'not planned', '--comment', reason.trim()];
  }
  if (!commit) return '--commit <sha> is required: a closed issue names what closed it';
  return ['issue', 'close', n, '--reason', 'completed', '--comment', `Fixed in ${commit}.`];
}
