// CLI execute omits Data Table module initialization in the installed n8n release.
// Initialize only that module in this short-lived process; do not edit installed n8n code.
const {Execute}=require('/usr/local/lib/node_modules/n8n/dist/commands/execute.js');
const original=Execute.prototype.init;
Execute.prototype.init=async function(){await original.call(this);await this.moduleRegistry.initModules(this.instanceSettings.instanceType,['data-table']);};
