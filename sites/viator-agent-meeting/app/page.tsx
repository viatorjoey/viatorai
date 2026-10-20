import {requireChatGPTUser} from './chatgpt-auth';
import MeetingApp from './meeting-app';
export const dynamic='force-dynamic';
export default async function Home(){await requireChatGPTUser('/');return <MeetingApp/>;}
