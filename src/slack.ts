import { WebClient } from '@slack/web-api';

export async function postSlack(text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL;
  if (!token || !channel) return;
  const client = new WebClient(token);
  try {
    await client.chat.postMessage({ channel, text });
  } catch (e: any) {
    console.warn('Slack error:', e?.data?.error || e?.message);
  }
}
