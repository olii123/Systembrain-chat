const STOP = new Set('a an and are as at be by can do does for from get have how i in is it me my of on or our please that the this to we what when where which who why will with you your us any there offer provide'.split(' '));
// Lowercase keywords with simple plural/-ing stripping, for keyword search and excerpt picking.
export const terms = s => (String(s).toLowerCase().match(/[a-z0-9$]+/g) || []).filter(w => w.length > 1 && !STOP.has(w)).map(w => w.replace(/(ing|es|s)$/, ''));
