# Lesende API-/MCP-Verifikation

Ein erfolgreicher `tools/list`-Aufruf prüft den MCP-Start, aber weder die
API-Anmeldung noch die Korrektheit jedes Werkzeugs. Umgekehrt kann eine API-Antwort
erfolgreich sein, während ein MCP-Client sie wegen eines unpassenden
`outputSchema` zurückweist.

## Reproduzierbare Tests ohne Zugangsdaten

```sh
npm ci
npm run build
npm test
node dist/list-tools.js
```

Die Integrationstests verwenden erfundene Werte und simulierte HTTP-Antworten.
`tests/routing.test.ts` verbindet einen echten MCP-SDK-Client über einen
In-Memory-Transport mit dem Server. Bei Tests von Antwortschemata muss zuerst
`client.listTools()` aufgerufen werden, damit der Client die Schemata kennt.
Erst danach prüft `client.callTool()` die strukturierte Antwort dagegen.

Beispiel einer zulässigen API-Antwort mit synthetischen Werten:

```json
{
  "success": true,
  "rows": 1,
  "data": [{ "id_by_customer": 123, "amount": "-12.30" }]
}
```

Die numerische ID darf nicht allein deshalb zurückgewiesen werden, weil das
Beispiel der Swagger-Spezifikation einen String verwendet. Optionale Felder
können null sein. Die gezielten Kompatibilitätskorrekturen erweitern nur bekannte
Antwortfelder; sie ersetzen keine Werte und lockern keine schreibenden Eingaben.

## Optionale Live-Prüfung

Nur mit einem eigenen bzw. ausdrücklich freigegebenen Konto durchführen.
`BB_READ_ONLY=true` setzen; Zugangsdaten weder in Testdateien noch in öffentliche
Logs schreiben. Keine zusätzlichen Schreibfunktionen für einen Lesetest aktivieren.

1. `tools/list` abrufen und die erwarteten Lesefunktionen prüfen.
2. Mit einem kurzen, bekannten Zeitraum und kleiner Seitengröße beginnen.
3. Für einen direkten API-Vergleich denselben Endpunkt mit identischen Filtern
   aufrufen. Auch lesende BuchhaltungsButler-Endpunkte verwenden HTTP POST;
   die HTTP-Methode allein bestimmt deshalb nicht die Wirkung.
4. Erfolg, unveränderte Daten und Antwortschema getrennt prüfen. Bei veränderlichen
   Datenbeständen können zeitversetzte Abrufe legitime Unterschiede zeigen.
5. Für Einzelabrufe eine ID aus einer tatsächlich empfangenen Liste verwenden.
   Der API-Pfad lautet beispielsweise `/receipts/get/123`, nicht wörtlich
   `/receipts/get/id_by_customer`. Analog gilt `/transactions/get/123`.
6. Beleg-/Transaktionszuordnungen in beide Richtungen prüfen. Eine erfolgreiche
   leere Liste ist kein Verbindungsfehler, ersetzt aber keinen Test einer
   tatsächlich vorhandenen Zuordnung.
7. Einen vorhandenen Beleg mit `get_file: true` abrufen. Base64 decodieren und
   Dateityp bzw. Dateikopf passend zur gelieferten Datei prüfen. Im Prüfprotokoll
   reichen Typ, Bytezahl und optional ein Hash; keine Beleginhalte veröffentlichen.
8. Ein Kontenblatt für ein Konto mit bekannten Buchungen abrufen. Dieser Endpunkt
   benötigt keine zuvor erzeugte SuSa.

### Seitennavigation

Bei beobachteten Antworten von `receipts_list`, `transactions_list` und
`postings_list` ist `rows` die Zahl der **zurückgegebenen** Datensätze. Zwei
verschiedene Seiten mit je zwei Einträgen können beide `rows: 2` enthalten.

Für einen vollständigen Export mit konstanten Filtern und festem Zeitraum bis
zu einer leeren Seite weiterblättern. Den Offset anhand der tatsächlich
empfangenen Datensätze erhöhen, Fortschritt prüfen und stabile IDs deduplizieren.
Wiederholte Seiten nicht endlos erneut abrufen. Bei Änderungen während des Exports
kann Offset-Paginierung Einträge verschieben; für Vollständigkeitszusagen braucht
es einen zusätzlichen Abgleich. Ein Test von zwei Seiten beweist nur, dass
Paginierung grundsätzlich funktioniert.

### BWA und Summen-/Saldenliste

`reports_get_bwa` und `reports_get_sums` benötigen eine gültige ID eines bereits
fertig erzeugten Berichts. Ohne diese Voraussetzung ist nur ein ausdrücklich
gekennzeichneter Negativtest möglich. „Report not found“ bestätigt keine
erfolgreiche Berichtsausgabe; ebenso wenig bestätigt eine erfolgreiche Ausgabe
die sachliche Richtigkeit der Buchhaltung.

Nicht automatisch `reports_create_*` aufrufen, um die Testvoraussetzung zu schaffen:
Ein neuer Bericht desselben Typs ersetzt den vorherigen. Das ist eine gesonderte,
zustandsverändernde Aktion außerhalb eines reinen Lesetests.

## Verbesserungsvorschläge

- Einen optionalen, vom Betreiber ausdrücklich gestarteten Live-Vertragstest
  anbieten. Er sollte ohne Schreibzugriffe auskommen, vorhandene IDs verwenden
  und Ergebnisse als erfolgreich, leer, Voraussetzung fehlt oder fehlerhaft
  unterscheiden. Nicht an öffentliche CI-Läufe mit Produktionszugängen koppeln.
- Neue Abweichungen zwischen Swagger und tatsächlicher API als minimierte,
  synthetische Antwortbeispiele in die normale Regressionstestsuite übernehmen.
- Seitennavigation und Dokumentenabruf neben dem reinen Werkzeugkatalog prüfen.
- Bei Spezifikationsupdates die lokalen Kompatibilitätskorrekturen abgleichen,
  statt unbekannte Typen generell zuzulassen oder alle Antwortprüfungen abzuschalten.

Diese Schritte prüfen die technische Schnittstelle. Sie ersetzen keinen
Vollständigkeitsabgleich mit Bankauszügen, Originalbelegen oder der Buchhaltung.

### Ergänzende Fälle aus längeren Datenabrufen

- Auch Untertypen von Konten, Beleg-IDs bei Buchungen, Zahlungsdaten,
  Rechnungsnummern und Beträge können fehlen. Ein `null`-Betrag bleibt unbekannt;
  er darf weder zu null Euro umgerechnet noch als vollständiger Beleg gewertet werden.
- Die Belegsortierung erwartet tatsächliche Feldnamen, etwa
  `order: {"date": "DESC", "amount": "ASC"}`. `field` ist in der Swagger-Datei
  ein Platzhalter und kein erforderlicher Schlüssel der API.
- Bei Vergleichen mit Buchhaltungsexporten ID, Datum, Kontierung, Steuerkennzeichen,
  Betragshöhe und Vorzeichen getrennt prüfen. Unterschiedliche Vorzeichen dürfen
  nicht ohne Prüfung der jeweiligen Darstellung umgerechnet werden.
- BWA-/SuSa-Dateien gegen die strukturierte Antwort abgleichen. Erfolgreicher
  Abruf und `integrityError: false` belegen keine abgeschlossene Buchhaltung;
  insbesondere `uncompletedPostingsCount` separat dokumentieren.
