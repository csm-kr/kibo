// How the learner's model edits a skill without resending it (round 4, speed). On bk7-bubbletea (round 3) 7 of 76
// turns resent the whole ~13k-token skill to change a few fields: about 78k of the run's 83k output tokens and a minute
// of generation each, and every copy stayed in the context. Every tool (runner, lint, audit, grader) and skill.json see
// the resolved skill only, in the format they always read.

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// JSON merge patch (RFC 7386): objects merge key by key, null deletes a key, anything else (arrays too) replaces.
function merge(target, patch) {
  if (!isObject(patch)) return structuredClone(patch);
  const out = isObject(target) ? structuredClone(target) : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = merge(out[k], v);
  }
  return out;
}

// A merge patch on the last skill, with one difference: "catalog" entries merge by "name" (an entry with a known name
// merges into that item, {"name", "remove": true} drops it, a new name is added at the end).
export function applySkillPatch(skill, patch) {
  if (!isObject(patch)) throw new Error('skillPatch must be a JSON object');
  const { catalog, ...rest } = patch;
  const out = merge(skill, rest);
  if (catalog === null) delete out.catalog;
  else if (catalog !== undefined) {
    if (!Array.isArray(catalog)) throw new Error('skillPatch: "catalog" must be a list of items to merge by name');
    const items = [...(out.catalog ?? [])];
    for (const entry of catalog) {
      if (!isObject(entry) || typeof entry.name !== 'string') throw new Error('skillPatch: every catalog entry needs "name"');
      const at = items.findIndex((c) => c?.name === entry.name);
      const { remove, ...fields } = entry;
      if (remove === true) { if (at >= 0) items.splice(at, 1); } else if (at >= 0) items[at] = merge(items[at], fields);
      else items.push(structuredClone(fields));
    }
    out.catalog = items;
  }
  return out;
}

// Option groups that several items share are written once in "sharedGroups": {"<name>": {group}}; an item lists the
// name as a string in its optionGroups. Resolved here into full groups, and "sharedGroups" is dropped.
export function resolveSkill(skill) {
  if (!isObject(skill)) throw new Error('the skill must be a JSON object');
  const { sharedGroups, ...out } = structuredClone(skill);
  for (const it of out.catalog ?? []) {
    if (!Array.isArray(it?.optionGroups)) continue;
    it.optionGroups = it.optionGroups.map((g) => {
      if (typeof g !== 'string') return g;
      const def = isObject(sharedGroups) ? sharedGroups[g] : undefined;
      if (!isObject(def)) throw new Error(`${it.name}: option group "${g}" is not in sharedGroups`);
      return { ...structuredClone(def), name: def.name ?? g };
    });
  }
  return out;
}
