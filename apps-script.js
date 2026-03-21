// ─── Google Apps Script ────────────────────────────────────────────────────
// À coller sur : script.google.com → Nouveau projet
// Remplacez SHEET_ID par l'ID de votre Google Sheet

const SHEET_ID = '14ED700edVjjo2JzctC6xlzs58qEUOdKngDfRZnTHiKA';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();

    // Ajouter l'en-tête si la feuille est vide
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Date', 'Nom', 'Prénom', 'Pseudo', 'Chaine Twitch', 'Statut']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#FF6B1A').setFontColor('#ffffff');
    }

    sheet.appendRow([
      new Date(data.date),
      data.nom,
      data.prenom,
      data.pseudo,
      data.twitch,
      'En attente'
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput('RushStream 974 - API OK')
    .setMimeType(ContentService.MimeType.TEXT);
}
