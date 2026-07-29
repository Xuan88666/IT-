import assert from 'node:assert/strict';
import { TOOL_CATALOG, getToolById, getToolGroups } from '../server/tool-catalog.mjs';

assert.ok(TOOL_CATALOG.length >= 124, 'all existing and planned tools must be cataloged');
assert.equal(new Set(TOOL_CATALOG.map((tool) => tool.id)).size, TOOL_CATALOG.length, 'tool ids must be unique');
assert.equal(getToolById('ping-test').group, 'network');
assert.equal(getToolById('printer-health').group, 'desktop');
assert.equal(getToolById('office-health').group, 'office');
assert.equal(getToolById('desktop-optimizer').risk, 'repair');
assert.equal(getToolById('vlsm-calc').group, 'network');
assert.equal(getToolById('raid-capacity').group, 'utility');
for (const id of ['bandwidth-time', 'cctv-storage', 'poe-budget', 'ups-runtime', 'optical-power', 'raid-capacity', 'vlsm-calc']) {
  assert.ok(getToolById(id), `${id} must be cataloged`);
}
assert.equal(getToolById('dns-benchmark').risk, 'read');
assert.equal(getToolById('ip-conflict-check').group, 'network');
for (const id of ['continuous-ping', 'batch-ping', 'subnet-ping']) assert.equal(getToolById(id).group, 'network');
assert.equal(getToolById('flow-monitor').group, 'network');
assert.equal(getToolById('link-monitor').risk, 'read');
assert.equal(getToolById('wifi-channel-analysis').risk, 'read');
assert.equal(getToolById('wifi-profile-export').risk, 'repair');
assert.equal(getToolById('packet-capture').risk, 'repair');
assert.equal(getToolById('pcap-analyzer').group, 'network');
assert.equal(getToolById('route-manager').risk, 'repair');
assert.equal(getToolById('firewall-manager').risk, 'repair');
assert.equal(getToolById('system-launcher').group, 'utility');
assert.equal(getToolById('remote-terminal').group, 'utility');
assert.equal(getToolById('rdp-history').risk, 'repair');
assert.equal(getToolById('serial-debug').risk, 'repair');
assert.ok(getToolGroups().network.length >= 40);
console.log('tool catalog verified: ' + TOOL_CATALOG.length + ' entries');
