// scripts/setup-lemlist.ts
// Eenmalig setup script — configureert de Lemlist campagne met 3 email stappen
// Uitvoeren: LEMLIST_API_KEY=xxx ts-node --project tsconfig.server.json scripts/setup-lemlist.ts

const CAMPAIGN_ID = 'cam_GGcsZaRXQdfYwaEzD';
const BASE_URL = 'https://api.lemlist.com/api';

function authHeader() {
  const key = process.env.LEMLIST_API_KEY;
  if (!key) throw new Error('LEMLIST_API_KEY niet ingesteld');
  const token = Buffer.from(`:${key}`).toString('base64');
  return {
    'Authorization': `Basic ${token}`,
    'Content-Type': 'application/json',
  };
}

const STEPS = [
  {
    delayDays: 0,
    subject: 'Social media voor {{brandName}} 🤍',
    body: `<p>Hey {{firstName}},</p><p>Ik zag jullie {{niche}} — masha'Allah wat mooi werk.</p><p>Ik ben Tamara van Next Move Marketing. Wij helpen moslim vrouwen brands in Nederland groeien via social media — meer bereik, meer klanten, zonder dat jij er extra tijd in hoeft te steken.</p><p>Ik heb een korte video opgenomen speciaal voor jullie → <a href="{{videoUrl}}">bekijk hier</a></p><p>En hier leg ik alles uit → <a href="{{vslUrl}}">bekijk de video</a></p><p>Zin om even te sparren?</p><p>Tamara 🤍<br>Next Move Marketing</p>`,
  },
  {
    delayDays: 3,
    subject: 'Even checken 🤍',
    body: `<p>Hey {{firstName}},</p><p>Wilde even checken of je mijn vorige bericht hebt gezien 🤍</p><p>De video staat hier → <a href="{{videoUrl}}">bekijk hier</a></p><p>Tamara</p>`,
  },
  {
    delayDays: 4,
    subject: 'Laatste berichtje',
    body: `<p>Hey {{firstName}},</p><p>Dit is mijn laatste berichtje. Wil je groeien via social media? Wij zijn er voor je 🌙</p><p><a href="{{vslUrl}}">Bekijk hier hoe we werken</a></p><p>Tamara</p>`,
  },
];

async function getCampaign() {
  const resp = await fetch(`${BASE_URL}/campaigns/${CAMPAIGN_ID}`, {
    headers: authHeader(),
  });
  if (!resp.ok) throw new Error(`GET campaign fout: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function addEmailStep(step: typeof STEPS[number], index: number) {
  const body = {
    type: 'sendEmail',
    delayDays: step.delayDays,
    subject: step.subject,
    body: step.body,
    isTrackingOpen: true,
    isTrackingClick: true,
  };

  const resp = await fetch(`${BASE_URL}/campaigns/${CAMPAIGN_ID}/emailSteps`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error(`  ✗ Stap ${index + 1} mislukt: ${resp.status} ${text}`);
    return null;
  }

  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  ✓ Stap ${index + 1} aangemaakt (delay +${step.delayDays} dagen)`);
  return json;
}

async function main() {
  console.log('=== Lemlist Campaign Setup ===');
  console.log(`Campaign ID: ${CAMPAIGN_ID}\n`);

  // 1. Haal campagne op
  console.log('1. Campagne ophalen...');
  let campaign: Record<string, unknown>;
  try {
    campaign = await getCampaign() as Record<string, unknown>;
    console.log(`  ✓ "${campaign.name}" (${campaign._id ?? campaign.id})`);
    console.log(`  Status: ${campaign.status ?? 'onbekend'}`);
  } catch (err) {
    console.error('  ✗', (err as Error).message);
    process.exit(1);
  }

  // 2. Voeg 3 email stappen toe
  console.log('\n2. Email stappen toevoegen...');
  const results = [];
  for (let i = 0; i < STEPS.length; i++) {
    const result = await addEmailStep(STEPS[i], i);
    results.push(result);
    // Kleine pauze tussen requests
    if (i < STEPS.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  // 3. Samenvatting
  const succeeded = results.filter(Boolean).length;
  console.log(`\n=== Klaar: ${succeeded}/${STEPS.length} stappen aangemaakt ===`);
  console.log(`Campaign: ${BASE_URL.replace('/api', '')}/campaigns/${CAMPAIGN_ID}`);

  if (succeeded < STEPS.length) {
    console.log('\n⚠️  Niet alle stappen zijn aangemaakt. Controleer of de stappen al bestaan in Lemlist.');
    console.log('   Als ze al bestaan, is dit normaal (Lemlist staat geen duplicaten toe).');
  }

  console.log('\nTemplate variabelen die je in Lemlist kunt gebruiken:');
  console.log('  {{firstName}}  — voornaam van lead/owner');
  console.log('  {{brandName}}  — bedrijfsnaam');
  console.log('  {{niche}}      — niche (bijv. "abaya collectie")');
  console.log('  {{videoUrl}}   — HeyGen gepersonaliseerde video URL');
  console.log('  {{vslUrl}}     — VSL pagina URL (uit env VSL_URL)');
}

main().catch(err => {
  console.error('Script mislukt:', err);
  process.exit(1);
});
