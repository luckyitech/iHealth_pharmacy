import { ITEM_LOOKUPS } from '@ihealth/shared/schemas';

import { MasterResourcePage } from '../master-resource-page.jsx';
import { lookupPageConfig } from './lookup-page.jsx';

/** The six item-master lookups; each becomes a route under /masters. */
const ITEM_LOOKUP_PAGES = Object.freeze({
  'item-categories': lookupPageConfig({
    resource: 'masters/item-categories',
    title: 'Item categories',
    singular: 'category',
    description: 'How products are grouped for pricing and reports.',
    schemas: ITEM_LOOKUPS.categories,
  }),
  'item-forms': lookupPageConfig({
    resource: 'masters/item-forms',
    title: 'Dosage forms',
    singular: 'form',
    description: 'Tablet, syrup, cream and the other forms a product comes in.',
    schemas: ITEM_LOOKUPS.forms,
  }),
  'item-groups': lookupPageConfig({
    resource: 'masters/item-groups',
    title: 'Item groups',
    singular: 'group',
    description: 'Broad groups such as medicals, surgicals or laboratory.',
    schemas: ITEM_LOOKUPS.groups,
  }),
  'generic-names': lookupPageConfig({
    resource: 'masters/generic-names',
    title: 'Generic names',
    singular: 'generic name',
    description: 'Active ingredients, used to find alternatives to a brand.',
    schemas: ITEM_LOOKUPS.genericNames,
  }),
  specializations: lookupPageConfig({
    resource: 'masters/specializations',
    title: 'Specializations',
    singular: 'specialization',
    description: 'Medical specialties a product is associated with.',
    schemas: ITEM_LOOKUPS.specializations,
  }),
  'units-of-measure': lookupPageConfig({
    resource: 'masters/units-of-measure',
    title: 'Units of measure',
    singular: 'unit',
    description: 'Units products are bought and sold in.',
    schemas: ITEM_LOOKUPS.unitsOfMeasure,
  }),
});

/**
 * @param {{ lookup: keyof typeof ITEM_LOOKUP_PAGES }} props
 * @returns {React.JSX.Element}
 */
export default function ItemLookupPage({ lookup }) {
  return <MasterResourcePage key={lookup} config={ITEM_LOOKUP_PAGES[lookup]} />;
}
