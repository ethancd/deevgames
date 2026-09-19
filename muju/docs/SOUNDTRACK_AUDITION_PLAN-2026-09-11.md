# Muju Hono Tanka — Lyria / ElevenLabs audition plan

Prepared 11 September 2026 for personal/family listening and hosting on the user's website. **Round one is complete:** twelve downloaded Hono auditions across Lyria and ElevenLabs. See the [audition results](SOUNDTRACK_AUDITION_RESULTS-2026-09-11.md). Later rounds remain proposals, pending listening and selection.

Companion files: [soundtrack pitch](SOUNDTRACK_PITCH-2026-09-11.md) and [nine prompt cards with request bodies for both providers](SOUNDTRACK_AUDITION_PROMPTS-2026-09-11.json).

## The recommendation

Start with **$5 of Google API credit and ElevenLabs Starter at $6/month**, subject to the live checkout. The initial commitment is about **$11 before taxes**. Google's credit is prepaid usage; ElevenLabs Starter is a renewing subscription. ElevenLabs also advertises pay-as-you-go API access; if the account offers Music-enabled pay-as-you-go with a smaller commitment, that is a reasonable alternative. The $22 Creator tier can wait until we know it provides something this audition needs.

First produce twelve 30-second clips: Hono in three directions, two takes from each provider. That is six minutes of listening, with three generated minutes per provider. Stop for selection before making more music.

## Signup and credentials

### Google Lyria

1. Sign in to [Google AI Studio](https://aistudio.google.com/) with your Google account.
2. Open API keys/Projects. Create or select a project named `Muju Soundtrack`; create an API key for it.
3. Choose **Set up billing** for that project. Complete the billing identity and payment fields. On the prepaid route, add **$5** and leave auto-reload off. Existing accounts may show a different billing flow.
4. Confirm the project is on a paid tier and has available credit. If a project spending cap is offered, use $5; the audition runner will additionally stop at $2 of estimated Lyria generation.
5. Save the key locally as `GEMINI_API_KEY` using the file described below. This uses Gemini API billing; no monthly consumer Gemini subscription is needed for this route.

Google documents the setup and $5 prepaid minimum in its [billing guide](https://ai.google.dev/gemini-api/docs/billing), and key creation/environment configuration in its [API-key guide](https://ai.google.dev/gemini-api/docs/api-key). Provider spending limits can lag, so the small bounded request list supplies the practical audition limit.

### ElevenLabs Music

1. Use **Sign up** on [ElevenLabs' API pricing page](https://elevenlabs.io/pricing/api), then complete account verification.
2. Select **Starter, monthly, $6** if that is the displayed offer. Complete checkout and confirm Music API access. If the account presents a Music-enabled pay-as-you-go option, it can serve this small test as well; inspect any deposit or minimum before selecting it.
3. Go to **Developers → API Keys → Create API Key**. Name it `Muju Soundtrack`.
4. Keep the key restricted and enable Music access. Give it a modest available quota; we will stop after at most twelve generated audio minutes for this audition, including retries. Any extra permission needed later should be tied to a specific feature such as stems.
5. Copy the key when created and save it locally as `ELEVENLABS_API_KEY`. The full key is only shown at creation.

The [official key walkthrough](https://help.elevenlabs.io/hc/en-us/articles/14599447207697-How-do-I-authorize-myself-using-an-API-key) documents those controls. [API pricing](https://elevenlabs.io/pricing/api) currently lists $0.15 per music minute and the $6 Starter tier. Check the account's actual allowance once connected because some older documentation uses different credit/minute tables.

### Local handoff

Create `/Users/ashkie/src/deevgames/muju/.env.music.local` in a text editor with:

```dotenv
GEMINI_API_KEY=replace_with_your_google_key
ELEVENLABS_API_KEY=replace_with_your_elevenlabs_key
```

The repository currently ignores `.env.*`; this was checked while preparing the plan. Keep this file local and outside website assets. There is no need to put keys or payment details in chat. Once the file is saved, the useful handoff is simply **“keys ready.”**

The execution step will load that file directly rather than depending on whether a desktop process inherited terminal environment variables. Logs will record key presence and request outcomes, never key values. Payment and login forms stay in the provider's website.

## Iteration sequence

| Round | What we generate | Question answered | Quantity |
| --- | --- | --- | ---: |
| Connection check | The first Hono/Lantern take on each provider; these count toward round 1 | Does the key work, does the result download, and is it actually audio? | 2 clips |
| 1 — Choose the sound | Hono × Lantern Circuit, Crystal Garden, Sixfold Current × both providers × two takes | Which overall treatment makes us want to keep listening? | 12 clips total, including the connection check |
| 2 — Test the range | Muju and Gölge in the strongest direction × both providers × two takes | Can this direction give the elements different identities? | 8 clips |
| 3 — Test development | Two surviving concepts, approximately 90 seconds each, on both providers | Can a good excerpt become useful background music? | 4 longer takes |
| 4 — Optional voice test | Two 30-second takes of the closing couplet on each provider | Does a tiny vocal passage improve the music? | 4 clips |

Round 1 is the initial execution batch. Later rounds follow the listening decision; do not launch all of them as one unattended job. Preserve two competing directions into round 2 only if the first comparison is inconclusive, using remaining headroom rather than silently doubling the batch.

At currently published rates, round 1 uses **$0.24 of Lyria generation and three minutes of ElevenLabs audio**. All four rounds use twelve Lyria clip requests plus two full-song requests, approximately **$0.64**, and **nine minutes** of ElevenLabs audio, equivalent to **$1.35** at its advertised API rate. Subscription fees or minimum deposits are separate from those consumption estimates. The [Lyria price list](https://ai.google.dev/gemini-api/docs/pricing) lists $0.04 per clip and $0.08 per full song.

Proposed execution limits: **$2 estimated Lyria generation, twelve ElevenLabs audio minutes, and no automatic extra purchases**. A timeout after submitting a generation should be investigated before resubmitting, because the first request may already have incurred usage. Stems, fine-tuning, and other operations are outside this initial audio budget.

## What we are testing musically

Keep Hono's identity consistent across the first three treatments: precise koto-like plucking, a gentle pitch bend after a note is struck, and a short rising phrase answered lower down. All are instrumental. We are comparing arrangements, not relying on a title or a genre label to describe the sound.

| Direction | Hono / Fire | Muju / Plant | Gölge / Shadow |
| --- | --- | --- | --- |
| **Lantern Circuit** | **Banked Fire**, 116 BPM: warm bass, electric-piano chords, restrained broken beats, chip echo of the koto phrase. | **A Field of Small Decisions**, 108 BPM: huayno-informed long-short-short figure, harp-like plucks, two voices completing one melody. | **One Square Out of Sight**, 112 BPM: bağlama-like ornaments, rounded bass, soft echoes, a displaced answering note. |
| **Crystal Garden** | **Ember Glass**, 104 BPM: the same Fire gesture surrounded by luminous FM bells and dub echoes; a clear gentle pulse. | **Glasshouse Morning**, 100 BPM: shared-note melody and resonant plucks provide motion while the drums stay sparse. | **Moon Behind the Screen**, 100 BPM: ornamented plucks, delayed replies, dark warm chords, generous spaces. |
| **Sixfold Current** | **Quickkindle**, 128 BPM: smooth bass and light breakbeats move around spacious koto phrases. | **Growing Room**, 128 BPM: interlocking chip lines and the long-short-short accompaniment persist through the faster groove. | **Borrowed Tempo**, 128 BPM: ornamental turns and chip replies make little rhythmic feints over a steady bass. |

The cultural research behind those gestures is linked in the original pitch. For the first comparison, Shadow is in 4/4. Its Turkish nine-unit rhythm is a later isolated experiment: group 9/8 as 2+2+2+3, retain the same instrumentation, and compare whether it feels natural. Treat its pulse carefully; a quarter-note BPM label alone does not describe the feel of 9/8.

## Copy-ready first-round prompts

The JSON packet includes complete prompts and provider request bodies for all nine cards. These are the three Hono descriptions in readable form; the same core wording goes to both providers in round 1.

**Hono / Lantern Circuit**

> Create a 30-second instrumental excerpt for a thoughtful, playful strategy game and family listening. 116 BPM, 4/4. Intimate Japanese koto-like plucks with an occasional gentle pitch bend after the attack. A short rising spark, a held note, then a low reply. A soft pulse-wave voice echoes only the last two notes. Warm electric bass, mellow electric-piano chords, understated broken-beat drums. Quiet confidence and banked heat. Start with the groove already present. Keep the melody memorable, the arrangement spacious, and the perceived loudness steady. No vocals, speech, chants, dramatic drops, piercing hi-hats, or final crash. Leave the final phrase open. Compose new music.

**Hono / Crystal Garden**

> Create a 30-second instrumental excerpt for a thoughtful, playful strategy game and family listening. 104 BPM, 4/4. An intimate Japanese koto-like rising phrase, a gently bent held note, then a low reply, surrounded by transparent FM bells and warm dub echoes. Spacious plucked resonance, a gently rolling bass, and sparse soft ticks. Luminous embers drifting in a dark room. Keep an audible pulse and a recognizable melody throughout. Begin already in motion. No vocals, speech, chants, dramatic drops, piercing hi-hats, or final crash. Leave the final phrase open. Compose new music.

**Hono / Sixfold Current**

> Create a 30-second instrumental excerpt for a thoughtful, playful strategy game and family listening. 128 BPM, 4/4. A Japanese koto-like rising phrase, a gently bent held note, then a low reply, in a nimble arrangement with light syncopated breakbeats and smooth bass. Short mellow pulse-wave responses fit between plucked phrases. Soft drum transients and limited cymbal activity. Melodic phrases remain spacious while the rhythm supplies momentum. Playful quickness. Begin already in motion. No vocals, speech, chants, dramatic drops, piercing hi-hats, or final crash. Leave the final phrase open. Compose new music.

Do not put the working track titles or other artists' names into provider prompts. Keep titles in local metadata. No reference recording needs uploading for this test.

## How the provider instructions differ

**Lyria:** use `lyria-3-clip-preview` for the 30-second comparisons. Place the musical instructions in the request's `input` text. For longer takes, switch to `lyria-3.5` and describe the development in that text. Exact length is a prompt target for the full-song model; a longer take is a new generation and may not preserve the chosen clip. Current documentation describes single-turn generation. [Lyria generation guide](https://ai.google.dev/gemini-api/docs/music-generation)

**ElevenLabs:** use `music_v2`, `music_length_ms: 30000`, and `force_instrumental: true` with the shared prompt. Set `music_length_ms: 90000` for the longer instrumental takes. In a later controlled arrangement test, use its `composition_plan` route to place sections explicitly; a request uses either a prompt or a composition plan, and the instrumental flag belongs to the prompt route. [Compose API](https://elevenlabs.io/docs/api-reference/music/compose)

Use default downloadable audio formats initially. Lyria responses contain audio data inside the response structure; ElevenLabs compose returns audio bytes. Both accounts successfully generated the round-one requests; all twelve files decoded successfully. The remaining prompt cards have not been tested. See the results for actual lengths and technical checks.

For the 90-second arrangement test, use this human-readable target in Lyria's text and as the design for an ElevenLabs composition plan if we elect to test that feature:

| Approximate time | Arrangement intention |
| --- | --- |
| 0–8 seconds | Establish groove and first melodic cell quickly. |
| 8–30 | Present the complete phrase and its answer. |
| 30–46 | Add one countermelody; keep bass and drums stable. |
| 46–60 | Remove a layer and give the listener more space. |
| 60–82 | Return to the main phrase with one useful variation. |
| 82–90 | Maintain the groove and leave a musically editable ending. |

These windows express development, not sample-accurate loop points. A final game loop will be cut and checked on musical barlines after generation. The exact original six-note game motif can be sequenced separately if either model treats pitch instructions loosely.

## Revision rules after listening

| What we hear | Next prompt change |
| --- | --- |
| Pleasant but generic | Simplify the brief to foreground the specific instrumental gesture and a repeatable two-part hook. |
| Too sleepy | Add bass anticipation and slightly more drum motion while retaining melodic space. |
| Too busy | Remove continuous arpeggios and most cymbal hits; leave one lead and one answer. |
| Cultural gesture disappeared | Preserve its rhythmic or ornamental instruction; remove competing decorative instruments. |
| Unexpected singing | Check the instrumental setting; strengthen the instrumental wording and reject the take for the instrumental pool. |
| Chip sound is shrill | Lower the lead register, soften its attack, and shorten exposed passages. |
| Lovely 30 seconds, weak longer track | Specify the sparse middle passage and returning hook; stop adding new themes. |

Change one meaningful feature per revision and save the previous take. Two fresh takes of the revision are enough to decide whether that change helped; do not chase endless tiny prompt variations.

## The optional lyric test

Use the same warm closing-track arrangement on both providers. The only sung words are:

> Leave a light beside the board.  
> There's another morning still.

Aim for one gentle unison voice, no spoken intro, no repeated chorus, with the couplet appearing once around the middle of the 30-second excerpt. Surround it with instrumental music. Lyria receives that instruction and the supplied lyrics as separate clearly marked parts of the text. ElevenLabs can use a prompt with `force_instrumental: false`, or a separately validated composition plan with empty lyric sections around one lyric section. No voice cloning is needed.

Only keep singing if it contributes something the instrumental version lacks. Full-length versions would place the passage much less frequently than this short test suggests.

## Listening and delivery

Save untouched originals, then make comparison copies at matched perceived loudness. Preserve both providers' native files; transcoding an MP3 into WAV does not restore lost detail. Randomize anonymous labels for the listening pass and reveal providers afterward.

For every take, answer three plain questions: **Would I leave it on? What phrase do I remember? What gets annoying?** Then try the best ones while playing or doing another concentration task. A 30-second winner still needs a longer listening check. The kids' immediate favorites are useful feedback too.

After each round, produce a local listening page with the audio players, short notes, provider/model revealed on demand, and the exact prompts. Keep it local for review until website posting is requested. Retain a small shortlist with reasons for each selection. The provider does not need to win every track.

## Ready-to-start condition

Both accounts are active, the local credentials file contains the keys, and the first small paid batch is within the agreed budget. Then run the two connection-check clips, inspect the actual charges and files, and complete only the remaining round-one requests. The first deliverable is **twelve audition clips**, followed by a listening decision.
