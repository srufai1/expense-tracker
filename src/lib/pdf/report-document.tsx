import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { ReportPdfModel } from "./model";

// Screen 10: the report as a real, downloadable A4 portrait PDF (D-20),
// made on the server. It only lays out the model (model.ts); it decides
// nothing itself. The Monday email attaches the same file.

const GREEN = "#0B5D4B";
const MUTED = "#5F6B66";
const LINE = "#DADFDC";
const RED = "#B42318";
const AMBER = "#B54708";

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, fontSize: 10, fontFamily: "Helvetica", color: "#151917" },
  heading: { fontSize: 18, fontFamily: "Helvetica-Bold", color: GREEN },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 2 },
  madeOn: { fontSize: 8, color: MUTED, marginTop: 2 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", marginBottom: 6 },
  summary: { flexDirection: "row", borderWidth: 1, borderColor: LINE, borderRadius: 6, marginTop: 14 },
  figure: { flex: 1, padding: 8 },
  figureLabel: { fontSize: 8, color: MUTED },
  figureValue: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  line: { marginTop: 3 },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 70, borderBottomWidth: 1, borderColor: LINE },
  barSlot: { flex: 1, height: "100%", justifyContent: "flex-end", paddingHorizontal: 1 },
  bar: { backgroundColor: GREEN },
  barLabels: { flexDirection: "row", marginTop: 2 },
  barLabel: { flex: 1, fontSize: 6, color: MUTED, textAlign: "center" },
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderColor: LINE },
  cellWide: { flex: 3 },
  cell: { flex: 1.4, textAlign: "right" },
  muted: { color: MUTED },
  bold: { fontFamily: "Helvetica-Bold" },
  suggestion: { flexDirection: "row", marginBottom: 4 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 7, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {/* Keeps the title on the same page as the first lines below it. */}
      <Text style={styles.sectionTitle} minPresenceAhead={40}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function ReportDocument({ model }: { model: ReportPdfModel }) {
  return (
    <Document title={`${model.heading} · ${model.title}`} author={model.madeOn}>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <Text style={styles.heading}>{model.heading}</Text>
        <Text style={styles.title}>{model.title}</Text>
        <Text style={styles.madeOn}>{model.madeOn}</Text>

        <View style={styles.summary}>
          {model.summary.map(([label, value]) => (
            <View key={label} style={styles.figure}>
              <Text style={styles.figureLabel}>{label}</Text>
              <Text style={styles.figureValue}>{value}</Text>
            </View>
          ))}
        </View>
        {model.comparisons.map((text) => (
          <Text key={text} style={[styles.line, styles.muted]}>
            {text}
          </Text>
        ))}

        {/* Even with nothing recorded, budget, goal and "missing days"
            suggestions still apply (§7.4). */}
        {model.suggestions.length > 0 ? (
          <Section title="Suggestions">
            {model.suggestions.map((text) => (
              <View key={text} style={styles.suggestion}>
                <Text style={{ width: 10, color: AMBER }}>•</Text>
                <Text style={{ flex: 1 }}>{text}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {model.empty ? (
          <Text style={[styles.section, styles.muted]}>{model.empty}</Text>
        ) : (
          <>
            <Section title={model.chart.title}>
              <View style={styles.chart}>
                {model.chart.bars.map((bar, index) => (
                  <View key={index} style={styles.barSlot}>
                    <View style={[styles.bar, { height: `${Math.max(bar.heightPercent, bar.heightPercent > 0 ? 2 : 0)}%` }]} />
                  </View>
                ))}
              </View>
              <View style={styles.barLabels}>
                {model.chart.bars.map((bar, index) => (
                  <Text key={index} style={styles.barLabel}>
                    {bar.label}
                  </Text>
                ))}
              </View>
            </Section>

            <Section title="Highlights">
              {model.highlights.map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <Text style={[styles.cellWide, styles.muted]}>{label}</Text>
                  <Text style={[{ flex: 5 }, styles.bold]}>{value}</Text>
                </View>
              ))}
            </Section>

            <Section title="Where the money went">
              {model.categories.map((line, index) => (
                <View key={index} style={styles.row}>
                  <Text style={[styles.cellWide, line.child ? { paddingLeft: 12, color: MUTED } : styles.bold]}>{line.name}</Text>
                  <Text style={styles.cell}>{line.amount}</Text>
                  <Text style={[styles.cell, styles.muted]}>{line.share}</Text>
                </View>
              ))}
            </Section>
          </>
        )}

        {model.budgets ? (
          <Section title={model.budgets.title}>
            {model.budgets.rows.map((row, index) => (
              <View key={index} style={styles.row}>
                <Text style={[styles.cellWide, styles.bold]}>{row.name}</Text>
                <Text style={styles.cell}>{row.spent}</Text>
                <Text style={[styles.cell, styles.muted]}>of {row.budget}</Text>
                <Text
                  style={[
                    styles.cell,
                    styles.bold,
                    { color: row.status === "Over" ? RED : row.status === "Watch" ? AMBER : GREEN },
                  ]}
                >
                  {row.status} · {row.usedPercent}%
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        {model.goals.length > 0 ? (
          <Section title="Goals">
            {model.goals.map((goal, index) => (
              <View key={index} style={styles.row}>
                <Text style={[styles.cellWide, styles.bold]}>{goal.name}</Text>
                <Text style={{ flex: 5 }}>
                  {goal.progress}
                  {goal.needed ? `\n${goal.needed}` : ""}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{model.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// The PDF file as bytes, for the download route and the Monday email.
export function renderReportPdf(model: ReportPdfModel): Promise<Buffer> {
  return renderToBuffer(<ReportDocument model={model} />);
}
