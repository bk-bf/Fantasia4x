// @ts-nocheck
const REST_FIELD_TYPES = new Set(['single_select', 'labels', 'milestone']);

function restValue(field) {
  const v = field.value;
  if (v == null) return undefined;
  if (field.data_type === 'single_select') return v.name?.raw ?? v.name;
  if (field.data_type === 'labels') return v.map((l) => l.name);
  if (field.data_type === 'milestone')
    return { title: v.title, description: v.description ?? '', dueOn: v.due_on ?? '' };
  return undefined;
}

export function fromRest(item, repository) {
  const c = item.content ?? {};
  const values = (item.fields ?? [])
    .map((field) => [field.name.toLowerCase(), restValue(field)])
    .filter(([, value]) => value !== undefined);
  return Object.assign(
    {
      id: item.node_id,
      title: c.title ?? '',
      content: {
        type: item.content_type,
        number: c.number,
        title: c.title,
        body: c.body ?? '',
        url: c.html_url,
        repository
      }
    },
    Object.fromEntries(values)
  );
}

export const restFieldIds = (pages) =>
  pages
    .flat()
    .filter((field) => REST_FIELD_TYPES.has(field.data_type))
    .map((field) => field.id);

export const cardsFromRest = (pages, repository) =>
  pages.flat().map((item) => fromRest(item, repository));

export const restIdOf = (pages, nodeId) =>
  pages.flat().find((entry) => entry.node_id === nodeId)?.id ?? null;

export const selectFieldsFromRest = (pages) =>
  pages
    .flat()
    .filter((field) => field.data_type === 'single_select')
    .map((field) => ({
      id: field.node_id,
      name: field.name,
      options: (field.options ?? []).map((o) => ({ id: o.id, name: o.name?.raw ?? o.name }))
    }));
