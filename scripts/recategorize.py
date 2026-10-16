"""把 vocab.json 的字母分類改成使用情境分類。執行：python3 scripts/recategorize.py"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ROOT / 'public' / 'vocab.json'
KEEP = '數字、時間與顏色'

CATEGORIES = {
'問候、禮貌與基本對話': """die Achtung|die Anrede|antworten|die Antwort|bitte|die Bitte|bitten|danken|der Dank|danke|
entschuldigen|die Entschuldigung|erzählen|fragen|die Frage|das Gespräch|der Glückwunsch|gratulieren|der Gruß|hallo|
heißen|helfen|herzlich|die Hilfe|ja|kennenlernen|klar|leider|lieb-|nein|die Ordnung|das Problem|sagen|sprechen|
tschüss|die Vorsicht|sich vorstellen|das Wiedersehen|willkommen|wunderbar""",

'人物、家庭與個人資料': """das Alter|der Ausländer|ausländisch|der Ausweis|das Baby|der Bekannte|der Bruder|die Dame|die Ehefrau|
der Ehemann|die Eltern|der Erwachsene|die Familie|der Familienname|der Familienstand|die Frau|der Freund|die Freundin|
geboren|das Geburtsjahr|der Geburtsort|der Geburtstag|die Geschwister|gestorben|die Großeltern|die Großmutter|
der Großvater|die Heimat|heiraten|der Herr|die Hochzeit|der Jugendliche|der Junge|das Kind|sich kümmern|leben|
das Leben|ledig|die Leute|das Mädchen|der Mann|männlich|der Mensch|die Mutter|der Name|die Oma|der Opa|die Papiere|
der Partner|die Partnerin|die Schwester|der Sohn|die Tochter|tot|der Vater|verheiratet|der Verwandte|der Vorname|weiblich""",

'身體、健康與日常作息': """sich anziehen|der Arm|der Arzt|die Ärztin|aufstehen|das Auge|sich ausziehen|baden|der Bauch|das Bein|
böse|der Doktor|sich duschen|fehlen|das Fieber|sich freuen|der Fuß|gefallen|gern / gerne|das Gewicht|das Glück|
glücklich|das Haar|die Hand|der Kopf|krank|lachen|lieben|lieber|mögen|müde|der Mund|die Praxis|rauchen|riechen|
schlafen|sich waschen|weh tun|die Zigarette|zufrieden""",

'食物、飲料與餐廳': """der Apfel|der Appetit|die Bäckerei|die Banane|bestellen|das Bier|die Birne|bitter|das Brot|das Brötchen|
die Butter|das Café|der Durst|das Ei|empfehlen|essen|das Essen|der Fisch|die Flasche|das Fleisch|frühstücken|
das Frühstück|das Gemüse|das Getränk|das Glas|grillen|das Hähnchen|der Hunger|der Kaffee|die Kartoffel|kochen|
der Kuchen|die Lebensmittel|das Lokal|die Milch|das Obst|das Öl|die Pommes frites|der Reis|das Restaurant|der Saft|
der Salat|das Salz|der Schinken|schmecken|die Speisekarte|der Tee|die Tomate|trinken|das Wasser|der Wein""",

'購物、金錢與衣物': """das Angebot|die Anzeige|der Automat|die Bank|bar|bezahlen|billig|einkaufen|das Geld|geöffnet|
geschlossen|das Geschäft|die Größe|günstig|die Jacke|die Karte|die Kreditkarte|die Kasse|kaufen|der Kiosk|
die Kleidung|das Konto|kosten|der Kunde|die Kundin|der Laden|der Preis|die Rechnung|der Schuh|die Tasche|teuer|
überweisen|verkaufen|der Verkäufer|die Verkäuferin|zahlen""",

'住家、家具與生活': """anmachen|an sein|das Apartment|auf sein|der Aufzug|ausmachen|aus sein|das Bad|der Balkon|das Bett|
die Dusche|das Feuer|der Garten|das Haus|nach Hause|zu Hause|der Herd|die Küche|der Kühlschrank|das Licht|mieten|
die Miete|die Möbel|der Raum|reparieren|die Reparatur|der Schlüssel|der Schrank|zu sein|das Sofa|der Stock|
der Tisch|die Toilette|die Treppe|umziehen|vermieten|der Vermieter|wohnen|die Wohnung|das Zimmer""",

'交通與旅行': """abfahren|die Abfahrt|abfliegen|der Abflug|ankommen|die Ankunft|die Ansage|der Anschluss|das Ausland|
die Auskunft|aussteigen|das Auto|die Autobahn|die Bahn|der Bahnhof|der Bahnsteig|besichtigen|der Bus|
das Doppelzimmer|die Durchsage|einsteigen|das Einzelzimmer|fahren|der Fahrer|die Fahrkarte|das Fahrrad|fliegen|
der Flughafen|das Flugzeug|die Führung|das Gepäck|das Gleis|die Halbpension|halten|die Haltestelle|das Hotel|
die Information|der Koffer|der Lkw|der Pass|der Plan|der Prospekt|reisen|die Reise|das Reisebüro|der Reiseführer|
die Rezeption|die S-Bahn|der Schalter|die Sehenswürdigkeit|die Straßenbahn|das Taxi|das Ticket|übernachten|
der Urlaub|der Zoll|der Zug""",

'城市、地點與方向': """der Ausgang|der Blick|da|daneben|das Dorf|dort / dorthin|draußen|die Ecke|der Eingang|geradeaus|
die Halle|hier|hinten|das Land|links|die Mitte|oben|der Ort|der Platz|die Polizei|rechts|das Schild|die Stadt|
die Straße|unten|weit|weiter|die Welt|zurück""",

'工作、辦公與電腦': """anklicken|arbeiten|die Arbeit|arbeitslos|der Arbeitsplatz|ausfüllen|der Beamte|der Beruf|der Chef|
die Chefin|der Computer|drucken|der Drucker|der Feierabend|die Firma|das Formular|die Hausfrau|der Hausmann|
das Internet|der Job|der Kollege|die Kollegin|die Maschine|das Papier|das Praktikum|selbstständig|die Stelle|
der Termin|unterschreiben|die Unterschrift|verdienen""",

'學校、學習與語言': """ankreuzen|sich anmelden|die Anmeldung|die Aufgabe|die Aussage|bedeuten|das Beispiel|der Bleistift|
der Bogen|das Buch|der Buchstabe|buchstabieren|das Ergebnis|erklären|der Fehler|die Gruppe|die Hausaufgabe|
der Kindergarten|die Klasse|der Kugelschreiber|der Kurs|der Lehrer|die Lehrerin|lernen|lesen|die Lösung|die Pause|
die Prüfung|der Satz|schreiben|die Schule|der Schüler|die Schülerin|die Sprache|studieren|das Studium|der Student|
die Studentin|der Test|der Text|das Thema|der Unterricht|verstehen|wiederholen|das Wort""",

'休閒、運動與娛樂': """der Ausflug|besuchen|das Bild|die CD|die Disco|einladen|die Einladung|der Eintritt|der Feiertag|feiern|
fernsehen|der Film|das Foto|die Freizeit|der Fußball|der Gast|das Geschenk|gewinnen|das Hobby|das Kino|laufen|
der Lieblingsfilm|das Lied|mitkommen|mitmachen|die Party|Rad fahren|schwimmen|das Schwimmbad|spielen|der Sport|
tanzen|sich treffen|der Verein|wandern|die Zeitung""",

'天氣、自然與動物': """der Baum|die Blume|der Hund|das Meer|regnen|der Regen|scheinen|der See|die Sonne|das Wetter|der Wind""",

'電話、郵件與聯絡': """der Absender|die Adresse|anrufen|der Anruf|der Anrufbeantworter|besetzt|der Brief|die Briefmarke|
die E-Mail|der Empfänger|das Fax|das Handy|die Nummer|die Post|die Postleitzahl|schicken|telefonieren|das Telefon|
die Vorwahl|das Wiederhören""",

'基本動詞與日常動作': """abgeben|abholen|anbieten|anfangen|aufhören|beginnen|bekommen|benutzen|bleiben|brauchen|bringen|
drücken|dürfen|erlauben|finden|geben|es gibt|gehen|gehören|glauben|haben|holen|hören|kennen|kommen|können|kriegen|
legen|liegen|machen|mitbringen|mitnehmen|möchten|müssen|nehmen|öffnen|schließen|sehen|sein|weg sein|sitzen|sollen|
stehen|stellen|suchen|tun|warten|werden|wissen|wollen""",

'時間、頻率與順序': """der Anfang|bald|dann|das Datum|dauern|einmal|enden|das Ende|früher|gerade|gestern|gleich|heute|
immer|jetzt|lange|letzte|meistens / die meisten|der Moment|morgen|nächste|nie|noch|oft|pünktlich|der Schluss|schon|
sofort|spät|später|die Uhr|die Zeit|zurzeit""",

'描述與形容詞': """allein|alt|aussehen|automatisch|bekannt|besser|am besten|breit|eilig|einfach|falsch|die Farbe|fertig|
frei|fremd|groß|gültig|gut|hell|hoch|international|jung|kaputt|klein|kulturell|kurz|lang|langsam|laut|leicht|leise|
lustig|möglich|neu|normal|richtig|ruhig|schlecht|schnell|schön|schwer|verboten|wichtig""",

'文法小詞（代名詞、介係詞、連接詞）': """ab|aber|alle / alles|also|an|andere|auch|auf|aus|bei|beide|bis|ein bisschen|
circa (ca.)|dein|denn|dich / dir|dieser / dieses|durch|er / es|euer|für|gegen|ich|ihr / ihm / ihn|in / ins|
jeder / jedes|kein|man|mehr|mein|mit|nach|nicht|nichts|nur|oder|ohne|sehr|seit|sich|sie / Sie|so|der Teil|über|um|
und|unser|unter|viel / viele|vielleicht|von|vor|wann|warum|was|was für ein|welcher / welches|wenig|wer|wie|wie viel|
wir|wo|woher|wohin|zu|zusammen|zwischen""",
}

def main() -> int:
    mapping: dict[str, str] = {}
    dup = []
    for cat, blob in CATEGORIES.items():
        for word in (w.strip() for w in blob.replace('\n', '').split('|')):
            if not word:
                continue
            if word in mapping:
                dup.append(word)
            mapping[word] = cat

    vocab = json.loads(VOCAB.read_text(encoding='utf-8'))
    known = {v['de'] for v in vocab}
    unknown = [w for w in mapping if w not in known]
    missing = [v['de'] for v in vocab if v['category'] != KEEP and v['de'] not in mapping]

    if dup or unknown or missing:
        print('重複:', dup); print('對照表有但字庫沒有:', unknown); print('字庫有但未分類:', missing)
        return 1

    for v in vocab:
        if v['category'] != KEEP:
            v['category'] = mapping[v['de']]

    order = [KEEP, *CATEGORIES.keys()]
    vocab.sort(key=lambda v: order.index(v['category']))
    lines = ',\n'.join('  ' + json.dumps(v, ensure_ascii=False) for v in vocab)
    VOCAB.write_text('[\n' + lines + '\n]\n', encoding='utf-8')

    from collections import Counter
    for cat, n in Counter(v['category'] for v in vocab).items():
        print(f'{n:4d}  {cat}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
