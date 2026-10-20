import {agentMcp} from '../../agent-mcp';
export const dynamic='force-dynamic';
export async function POST(req:Request){return agentMcp(req,'claude');}
