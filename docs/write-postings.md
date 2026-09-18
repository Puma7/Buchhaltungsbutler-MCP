# Belege und Zahlungen buchen: Schema und Teilfehler

Diese Hinweise betreffen `postings_create_for_receipt` und
`postings_create_for_transaction`. Andere Schreibwerkzeuge sind nicht Teil
dieser Korrektur.

## Warum die Anpassungen nötig sind

Die öffentliche [API-Spezifikation](https://app.buchhaltungsbutler.de/docs/api/v1.de.json)
(Version 1.9.1, geprüft am 18.09.2026) enthält widersprüchliche Angaben.
Der MCP übernimmt sie weitgehend automatisch. An diesen Stellen braucht er
deshalb gezielte Korrekturen:

| Stelle | Widerspruch | Verhalten des MCP nach der Korrektur |
| --- | --- | --- |
| Buchungstext bei mehreren Belegen | Die Definition `ReceiptPostings` nennt `postingstexts`. Der Einzelendpunkt dokumentiert `postingtexts`; dieser Name funktioniert auch beim Batch. Mit dem anderen Namen wurde Fehler 23 „No postingtexts are set“ beobachtet. | Das Werkzeug bietet `postingtexts` als Pflichtfeld an. |
| Kreditor und Debitor | Das Schema verlangt beide. Die Beschreibung verlangt einen Kreditor jedoch nur bei passenden Eingangsbelegen und aktivierter Kreditorenbuchung; für Debitoren gilt das entsprechend bei Ausgangsbelegen. | Keine pauschale Pflicht für beide Felder. Ihre Beschreibungen bleiben erhalten. Die API prüft weiterhin, welches Konto im konkreten Fall nötig ist. |
| Beleg-IDs für offene Posten | Das Schema verlangt sie immer und erlaubt nur Zahlen. Die Beschreibung macht sie von der Kontoeinstellung abhängig und erlaubt ausdrücklich `null` für eine Teilbuchung ohne Beleg. | Das Feld ist nicht generell verpflichtend. Die Liste erlaubt Zahlen und `null`. |
| `errors[].request_data` | Das Schema nennt ein Array. Beobachtete Fehler beim Beleg- und Zahlungsbuchen enthalten stattdessen das eingereichte Objekt. | Beide Formen sind im Antwortschema erlaubt. Andere Felder behalten ihre Prüfung. |

Nach einem Update den MCP neu starten und den Werkzeugkatalog neu laden.
Bereits gespeicherte Aufrufe mit `postingstexts` müssen auf `postingtexts`
umgestellt werden. Werte oder Beträge werden nicht automatisch verändert.

## Ein erfolgreicher Aufruf kann fehlgeschlagene Buchungen enthalten

Bei einem Batch kann BuchhaltungsButler außen `success: true` melden und
gleichzeitig Einträge in `errors` zurückgeben. Das äußere Feld reicht daher
nicht aus, um eine Buchung als erfolgreich zu melden.

Ein künstliches Beispiel für eine vollständig abgelehnte Belegbuchung:

```json
{
  "success": true,
  "receipts": [],
  "errors": [{
    "success": false,
    "error_code": 23,
    "message": "No postingtexts are set",
    "request_data": { "receipt_id_by_customer": 123 }
  }]
}
```

Der MCP kennzeichnet eine solche Antwort jetzt mit `isError: true`. Das gilt
auch für einen Batch mit erfolgreichen und fehlgeschlagenen Einträgen. Ein
ausdrückliches `success: false` in den Einzelresultaten wird vorsorglich ebenfalls
erkannt; diese Variante ist synthetisch getestet, aber hier nicht live beobachtet.
Die vollständige
API-Antwort bleibt unverändert als `structuredContent` erhalten und steht
zusätzlich im Text. Eine leere Fehlerliste bei erfolgreichen Ergebnissen
bleibt ein Erfolg.

**Ein Fehler bedeutet hier nicht, dass der ganze Batch zurückgerollt wurde.**
Andere Einträge können bereits gebucht sein. Deshalb:

1. Erfolgreiche und fehlgeschlagene Einträge der Antwort getrennt prüfen.
2. Vor einer Wiederholung das Buchungsjournal abgleichen. Nach einem
   Verbindungsabbruch ist der Ausgang zunächst unbekannt.
3. Nur nachweislich fehlgeschlagene Einträge nach Korrektur erneut senden.
   Den gesamten Batch nicht einfach wiederholen.

Der Server führt keinen automatischen Wiederholungsversuch aus.
Belegbuchung, Zahlungsbuchung und Belegzuordnung bleiben getrennte Schritte.
Negative Korrekturzeilen werden nicht pauschal in positive Beträge verwandelt.

## Prüfung und Grenzen

`tests/write-postings.test.ts` prüft mit erfundenen Daten die Eingabe- und
Antwortschemas sowie vollständige Erfolge, vollständige Fehler und Teilerfolge
über eine echte MCP-Verbindung im Arbeitsspeicher. Nur die HTTP-Antworten der
externen API werden ersetzt. Der strenge SDK-Client lädt zuerst den
Werkzeugkatalog. Zusätzlich werden die Antwortschemas direkt geprüft, damit
das Fehlerkennzeichen keine falsche Schemadefinition verdeckt.

```sh
npm ci
npm run build
npm test
```

Die Tests benötigen keine Produktionszugänge und erzeugen keine echten
Buchungen. Die zugrunde liegenden Praxisbeobachtungen betreffen bestimmte
Fälle eines Kundenkontos; sie sind keine Zusage für jede Kontoeinstellung oder
jeden Schreibendpunkt. Fachliche Ablehnungen der API, etwa ein unzulässiger
Steuerschlüssel, werden weiterhin als Fehler ausgegeben.

Die Korrekturen stehen in `src/write-compat.ts`. Die gebündelte Herstellerdatei
bleibt unverändert, damit Herkunft und Umfang der Anpassungen sichtbar sind.
