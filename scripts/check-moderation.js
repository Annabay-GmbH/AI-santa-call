import 'dotenv/config';
import OpenAI from 'openai';
import {screenContent} from '../safety.js';

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not configured.');
  process.exitCode = 1;
} else {
  const client = new OpenAI({apiKey:process.env.OPENAI_API_KEY, maxRetries:0, timeout:15000});
  try {
    // Fixed synthetic text, never microphone audio or user content.
    const result = await screenContent(client, 'Hello, I like drawing stars.');
    console.log(`Child-safety check: reachable; synthetic result ${result}.`);
  } catch (error) {
    const status = Number.isInteger(error.status) ? `HTTP ${error.status}` : 'request failed';
    const requestId = typeof error.requestID === 'string' && /^req_[A-Za-z0-9_-]+$/.test(error.requestID) ? `; request ID ${error.requestID}` : '';
    console.error(`Child-safety check: ${status}${requestId}.`);
    console.error('Check the OpenAI project and API-key permissions, or share the request ID with OpenAI support.');
    process.exitCode = 1;
  }
}
