# Santa Call 🎅

**A little call. A lot of magic.**

Santa Call is an open-source, mobile-friendly web app for a cozy, supervised conversation with a make-believe AI Santa. A child and a trusted adult choose a language, take turns speaking with Santa, and finish with a small virtual gift inspired by the conversation. An animated 3D Santa brings the experience to life.

An Annabay GmbH project, shared under the [GNU General Public License v3.0](LICENSE).

> **Prototype — not ready for public use with children.** Calls are disabled by default. Before enabling them, complete the child-safety, privacy, legal, security, and operational review below. AI and moderation can make mistakes, and a checkbox is not a verified parental consent mechanism.

## The experience

- A mobile-first, accessible interface with a simple push-to-talk interaction and a trusted adult nearby.
- The interface, fixed safety messages, and Santa’s responses use the selected language. The language is locked for the duration of each call. Translations and spoken language quality need review and testing for each audience.
- A lightweight, animated, procedurally built 3D character with a fallback when WebGL is unavailable and reduced-motion support.
- A tap-to-open virtual present with an animated fantasy scene. Santa chooses a visual theme and creates a screened gift name and message inspired by a harmless interest. Families can also request a downloadable two-page PDF of AI-generated illustrations based on short, screened scene descriptions. It is a digital gift, not a physical product.
- No account, child profile, advertising, tracking analytics, or persistent conversation database in this prototype.

## How it works

Before a call, a grown-up is asked to acknowledge the AI voice experience and remain with the child. This checkbox does not verify age, adult identity or parental authority. The browser records one short turn at a time. The server transcribes it, runs Responses API inline moderation and a child-safety classifier on the input, generates a response and a personalized gift with an allowlisted visual theme, screens both, then converts the response to speech. If screening fails or flags sensitive content, the call stops and directs the family to a trusted adult. The server keeps the API key private and the conversation in memory; calls expire after five minutes and ending a call deletes it.

Audio and text are sent to OpenAI for processing. If a family requests a picture book, two short, screened scene descriptions derived from the conversation—not the full transcript—are sent to OpenAI image generation, and the resulting illustrations are sent to OpenAI for safety screening. A short-lived private token is held in server memory until the PDF is generated or expires. The PDF is produced in memory and can be downloaded to the user’s device. Only if a grown-up explicitly selects the optional archive checkbox, the app also encrypts that illustrated PDF and saves it on the server for a 90-day retention period. No recording, transcript, image prompt, name, or session ID is intentionally written to the archive. The app itself does not save recordings or transcripts to disk, but provider and infrastructure retention policies still apply. Avoid request-body logging and check your deployment's proxy and hosting logs. Server restarts clear active calls. The in-memory session and rate limiter are suitable for a single prototype instance only.

## Run locally

Prerequisites: Node.js 20 or newer, npm, an OpenAI API key, and a current browser supporting microphone recording and WebGL. The app can be viewed without a key.

```sh
npm install
cp .env.example .env
npm start
```

Open <http://localhost:3000>. Microphone access requires localhost or HTTPS and browser permission. Most browsers can record WebM or MP4 directly. Firefox or another browser may produce Ogg; install FFmpeg and make `ffmpeg` available on the server PATH for the in-memory Ogg-to-WAV fallback (or set `FFMPEG_PATH` to its executable). No audio is written to disk by this conversion. To run the basic checks:

```sh
npm test
```

To test actual AI calls, first complete the launch review below, including obtaining and verifying appropriate zero data retention for **every** OpenAI endpoint and model used. Configure the protected safety event log described in [SAFETY.md](SAFETY.md), then set `OPENAI_API_KEY` and `CHILD_SAFETY_REVIEWED=true` in `.env` and restart the server. The flag is an operator attestation, not a technical verification of ZDR or compliance. Calls remain unavailable until all required settings are configured. Never commit `.env` or expose your key in browser code. Model overrides are listed in `.env.example`; verify availability and data controls for any change.

## Optional illustrated-gift archive

This feature is disabled unless `GIFT_ARCHIVE_DIR` and either `GIFT_ARCHIVE_KEY_FILE` or `GIFT_ARCHIVE_KEY` are configured. The checkbox is separate from call consent and unchecked for every new gift. If a grown-up chooses it, only the screened two-page PDF is stored using AES-256-GCM. The family receives a private deletion code, which can be entered under **Delete a saved illustration** on the home page. Keep the code private; it cannot be recovered by the operator. A successful request with a valid code reports the same result if the gift was already deleted or expired. If saving fails, the PDF remains available for download and the page reports the failure.

The server schedules deletion for 90 days after saving and runs cleanup on startup. Deployments must keep the service running and monitor cleanup errors; set up an independent scheduled `node scripts/gift-archive.js cleanup` job and alerting to cover restarts and outages. If neither service nor cleanup job runs, expired files remain until cleanup runs. Ensure backups, snapshots, replicated copies, and exported PDFs follow the same deletion and retention policy; deleting a live file does not erase those copies. Storage encryption is not anonymization: illustrations can reveal details and should be treated as potentially personal data. Assess applicable privacy, consent, access and deletion requirements before public use; a checkbox alone does not verify parental authority.

Configure an absolute, private archive directory outside the web root (directory mode `0700`), and a separate private key file (mode `0600`) containing a base64-encoded 32-byte random key. Keep the key outside the repository and protect its backup separately; losing or changing it makes existing gifts unreadable. Set the absolute paths in `.env` or your secret manager. For example, generate a key with `openssl rand -base64 32` into a protected file without displaying or committing it. Setting `GIFT_ARCHIVE_KEY` directly instead of `GIFT_ARCHIVE_KEY_FILE` is supported for secret managers; never set both.

Authorized operators can inspect the local archive without exposing it on the website:

```sh
node scripts/gift-archive.js list
node scripts/gift-archive.js export <archive-id> <new-file.pdf>
node scripts/gift-archive.js cleanup
```

The list contains random, non-identifying archive IDs, not names or chat history. Export writes a new unencrypted PDF; protect it and delete it when no longer needed. No automatic copy is created in ChatGPT or an OpenAI storage service. OpenAI receives image-generation and screening requests as described above; API provider retention settings are separate. A future ChatGPT connection would need separate authentication, privacy review and deletion handling.

## Child safety and launch checklist

This prototype is a starting point, not a guarantee of safe responses or legal compliance. A public deployment serving children needs, at minimum:

1. **Provider and data review.** OpenAI's [under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) says not to process personal data of children under 13 or the applicable age of digital consent without first implementing API zero data retention. Confirm eligibility and settings for transcription, moderation, text generation, image generation, image screening, and speech individually, and review [data controls](https://developers.openai.com/api/docs/guides/your-data). Audio can contain personal data even when no name is requested.
2. **Consent and privacy.** Obtain legal advice for the places served; determine and implement any legally required age assurance, verifiable parental consent, privacy notice, data-subject rights, retention rules, vendor agreements, and incident processes. The adult checkbox is only an interface acknowledgement. Disclose AI and AI-generated voice in age-appropriate terms.
3. **Safety evaluation.** Have child-safety specialists evaluate responses, transcription errors, crisis and abuse disclosures, prompt injection, personal data, and false positives and negatives across languages and age groups. Operate and validate the privacy-preserving reporting and human escalation process described in SAFETY.md. Moderation and prompting cannot detect every risky interaction. The current safety stop asks for a trusted adult and ends the session; it is not an emergency service.
4. **Security and operations.** Add real access controls, abuse and spending protections, distributed rate limits, session quotas, infrastructure hardening, monitoring that minimizes sensitive data, and TLS. The current session identifier is a bearer credential, there is no user authentication, and the default rate limit is per process. Restrict access during testing. Review dependencies and rehearse incidents before any public launch.
5. **Accessibility and localization.** Have qualified speakers review translations, including consent and safety messages; test with families, assistive technology, and supported mobile browsers. Evaluate the 3D scene's performance and provide alternatives.

## Configuration

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Secret API key used only by the server. |
| `CHILD_SAFETY_REVIEWED` | Operator attestation to enable calls; default `false`. |
| `SAFETY_EVENTS_FILE` | Absolute path to a protected, monitored event log. |
| `OPENAI_SAFETY_MODEL` | Child-safety classifier model; defaults to the conversation model. |
| `OPENAI_CHAT_MODEL` | Conversation model; defaults to `gpt-6-astra`. |
| `OPENAI_TRANSCRIBE_MODEL` | Transcription model; defaults to `gpt-transcribe`. |
| `OPENAI_IMAGE_MODEL` | Illustrated-gift image model; defaults to `gpt-image-2.5-flare`. |
| `OPENAI_TTS_MODEL` | Speech model; defaults to `gpt-4o-mini-tts`, which accepts Santa-style voice instructions. The legacy `tts-1` and `tts-1-hd` models do not support those instructions. |
| `GIFT_ARCHIVE_DIR` | Optional absolute path to the private illustrated-gift archive. |
| `GIFT_ARCHIVE_KEY_FILE` | Optional absolute path to the protected archive encryption key file. |
| `GIFT_ARCHIVE_KEY` | Alternative base64 32-byte key supplied by a secret manager; never use with the key file. |
| `PORT` | HTTP port; defaults to `3000`. |

API access and usage incur provider costs, including two image-generation requests and image safety checks for each requested book. Image generation may require OpenAI organization verification. The downloadable book feature and its image services must be included in your ZDR, privacy, consent, and child-safety review before use with children. Confirm model access, rates, and eligible data controls before enabling the service. To diagnose Responses API moderation access with fixed synthetic text, run `npm run check:moderation`; it prints an HTTP status and request ID without logging your key or conversation content.

## Project structure

- `server.js`, `audio.js`, `safety.js`, `book.js`, `gift-archive.js` — call lifecycle, audio preparation, child-safety screening, illustrated PDFs and incident events.
- `SAFETY.md` — consent limitations and incident response runbook.
- `public/` — mobile web interface, procedural Three.js character, and call controls.
- `PROMPT.md` — expanded product brief and Santa behavior guidance.
- `test/` — basic server behavior tests.

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes, especially anything affecting children's safety or privacy. Keep examples free of real children's data. Run `npm test` before submitting changes, explain what changed, and include any relevant safety and accessibility testing. Do not post sensitive incident details publicly.

## License

GPL-3.0-only. See [LICENSE](LICENSE). Third-party dependencies have their own licenses.
