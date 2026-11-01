# Santa Call 🎅

**A little call. A lot of magic.**

Santa Call is an open-source, mobile-friendly web app for a cozy, supervised conversation with a make-believe AI Santa. A child and a trusted adult choose a language, take turns speaking with Santa, and finish with a small virtual gift inspired by the conversation. An animated 3D Santa brings the experience to life.

An Annabay GmbH project, shared under the [GNU General Public License v3.0](LICENSE).

> **Prototype — not ready for public use with children.** Calls are disabled by default. Before enabling them, complete the child-safety, privacy, legal, security, and operational review below. AI and moderation can make mistakes, and a checkbox is not a verified parental consent mechanism.

## The experience

- A mobile-first, accessible interface with a simple push-to-talk interaction and a trusted adult nearby.
- Santa speaks in the selected language; the interface and fixed safety messages are currently in English. Language quality and availability need testing for each audience.
- A lightweight, animated, procedurally built 3D character with a fallback when WebGL is unavailable and reduced-motion support.
- A visual, symbolic gift selected from a small set based on a harmless interest in the conversation. It is not a real-world gift or a generated image.
- No account, child profile, advertising, tracking analytics, or persistent conversation database in this prototype.

## How it works

The browser records one short turn at a time. The Node.js server transcribes the recording, checks the transcript with OpenAI moderation, asks the model for a short response and an allowlisted gift, checks the response, and converts it to speech. The browser plays that audio. The server keeps the API key private and stores the short conversation only in process memory for the call; ending the call deletes it, and sessions expire after ten minutes. Calls automatically end after five minutes in the client.

Audio and text are sent to OpenAI for processing. The app itself does not save recordings or transcripts to disk, but provider and infrastructure retention policies still apply. Avoid request-body logging and check your deployment's proxy and hosting logs. Server restarts clear active calls. The in-memory session and rate limiter are suitable for a single prototype instance only.

## Run locally

Prerequisites: Node.js 20 or newer, npm, an OpenAI API key, and a current browser supporting microphone recording and WebGL. The app can be viewed without a key.

```sh
npm install
cp .env.example .env
npm start
```

Open <http://localhost:3000>. Microphone access requires localhost or HTTPS and browser permission. To run the basic checks:

```sh
npm test
```

To test actual AI calls, first complete the launch review below, including obtaining and verifying appropriate zero data retention for **every** OpenAI endpoint and model used. Then set `OPENAI_API_KEY` and `CHILD_SAFETY_REVIEWED=true` in `.env` and restart the server. The flag is an operator attestation, not a technical verification of ZDR or compliance. Calls will remain unavailable unless both are set. Never commit `.env` or expose your key in browser code. Model overrides are listed in `.env.example`; verify availability and data controls for any change.

## Child safety and launch checklist

This prototype is a starting point, not a guarantee of safe responses or legal compliance. A public deployment serving children needs, at minimum:

1. **Provider and data review.** OpenAI's [under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) says not to process personal data of children under 13 or the applicable age of digital consent without first implementing API zero data retention. Confirm eligibility and settings for transcription, moderation, generation, and speech individually, and review [data controls](https://developers.openai.com/api/docs/guides/your-data). Audio can contain personal data even when no name is requested.
2. **Consent and privacy.** Obtain legal advice for the places served; implement any required verifiable parental consent, age assurance, privacy notice, data-subject rights, retention rules, vendor agreements, and incident processes. The adult checkbox is only an interface acknowledgement. Disclose AI and AI-generated voice in age-appropriate terms.
3. **Safety evaluation.** Have child-safety specialists evaluate responses, transcription errors, crisis and abuse disclosures, prompt injection, personal data, and false positives and negatives across languages and age groups. Add a privacy-preserving reporting and human escalation process. Moderation and prompting cannot detect every risky interaction. The current safety stop asks for a trusted adult and ends the session; it is not an emergency service.
4. **Security and operations.** Add real access controls, abuse and spending protections, distributed rate limits, session quotas, infrastructure hardening, monitoring that minimizes sensitive data, and TLS. The current session identifier is a bearer credential, there is no user authentication, and the default rate limit is per process. Restrict access during testing. Review dependencies and rehearse incidents before any public launch.
5. **Accessibility and localization.** Translate the whole interface, consent and safety messages, and gift text; test with families, assistive technology, and supported mobile browsers. Evaluate the 3D scene's performance and provide alternatives.

## Configuration

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Secret API key used only by the server. |
| `CHILD_SAFETY_REVIEWED` | Operator attestation to enable calls; default `false`. |
| `OPENAI_CHAT_MODEL` | Conversation model; defaults to `gpt-6-astra`. |
| `OPENAI_TRANSCRIBE_MODEL` | Transcription model; defaults to `gpt-transcribe`. |
| `OPENAI_TTS_MODEL` | Speech model; defaults to `gpt-4o-mini-tts`. |
| `PORT` | HTTP port; defaults to `3000`. |

API access and usage incur provider costs. Confirm model access, rates, and eligible data controls before enabling the service.

## Project structure

- `server.js` — session lifecycle, OpenAI calls, safety checks, and API endpoints.
- `public/` — mobile web interface, procedural Three.js character, and call controls.
- `PROMPT.md` — expanded product brief and Santa behavior guidance.
- `test/` — basic server behavior tests.

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes, especially anything affecting children's safety or privacy. Keep examples free of real children's data. Run `npm test` before submitting changes, explain what changed, and include any relevant safety and accessibility testing. Do not post sensitive incident details publicly.

## License

GPL-3.0-only. See [LICENSE](LICENSE). Third-party dependencies have their own licenses.
