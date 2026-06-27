const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/verify", async (req, res) => {
  const { imageBase64, mediaType, txType, todayStr } = req.body;
  if (!imageBase64 || !txType) {
    return res.status(400).json({ error: "Paramètres manquants." });
  }

  const LABELS = {
    om_national:      "Orange Money National BF",
    moov_benin:       "Moov Bénin → BF",
    moov_togo:        "Moov Togo → BF",
    wave:             "Wave",
    moov_national:    "Moov Money National BF",
    om_international: "Orange Money International (CI/ML/SN)"
  };

  const prompt = `Tu es un robot de vérification de transactions mobiles en Afrique de l'Ouest. Analyse cette image de confirmation de paiement de type: ${LABELS[txType] || txType}. Date d'aujourd'hui: ${todayStr}.

Extrais les données et réponds UNIQUEMENT en JSON valide, sans markdown ni backticks.

Format exact:
{
  "montant": "valeur numérique sans espaces ni unité (ex: 15000)",
  "numero": "numéro du destinataire sans espaces ni + (ex: 22651507834)",
  "nom": "nom complet si présent sinon null",
  "date": "date au format DD/MM/YYYY ou null",
  "statut": "succès ou échec",
  "type_detecte": "type de transaction détecté",
  "confiance": "haute ou moyenne ou faible",
  "notes": "observations importantes"
}

Règles importantes:
- Le numéro est celui du DESTINATAIRE (à qui l'argent est envoyé)
- Pour Wave: numéro affiché au-dessus du bouton Partager, format comme "À africa t d 56853244"
- Pour Orange Money: numéro dans "au numero XXXXXXXX" ou "vers le +XXXXXXXXXXX"
- Pour Moov: numéro dans "au 22651507834" ou "Numéro de mobile: XXXXXXXXXXX"
- Montant: chiffres seulement, sans FCFA ni espaces
- Date exacte visible dans l'image`;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const body = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: mediaType || "image/jpeg",
              data: imageBase64
            }
          },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsed;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: "Réponse invalide de l'IA: " + text.slice(0, 100) });
    }

    res.json({ ok: true, data: parsed });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
