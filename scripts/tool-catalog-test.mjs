import assert from 'node:assert/strict';
import { TOOL_CATALOG, getToolById, getToolGroups } from '../server/tool-catalog.mjs';

assert.ok(TOOL_CATALOG.length >= 90, 'all existing and planned tools must be cataloged');
assert.equal(new Set(TOOL_CATALOG.map((tool) => tool.id)).size, TOOL_CATALOG.length, 'tool ids must be unique');
assert.equal(getToolById('ping-test').group, 'network');
assert.equal(getToolById('printer-health').group, 'desktop');
assert.equal(getToolById('office-health').group, 'office');
assert.equal(getToolById('desktop-optimizer').risk, 'repair');
assert.ok(getToolGroups().network.length >= 40);
console.log('tool catalog verified: ' + TOOL_CATALOG.length + ' entries');

