import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatGBP } from "@/lib/format";

// Times-Roman (built into every PDF reader, no external font fetch during
// render - a network dependency there would make PDF generation only as
// reliable as some third-party font host) for headings, Helvetica for
// body copy - the same serif-heading/sans-body pairing the web version of
// this document uses (Fraunces/Public Sans), just built from what
// react-pdf ships without adding a fragile runtime font load.
const styles = StyleSheet.create({
  page: { padding: 0, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  accentBar: { height: 6 },
  body: { padding: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 48, height: 48, objectFit: "contain" },
  businessName: { fontSize: 14, fontFamily: "Times-Roman", fontWeight: 700 },
  businessMeta: { fontSize: 8, color: "#666", marginTop: 2, maxWidth: 220 },
  eyebrow: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginTop: 22, fontWeight: 700 },
  title: { fontSize: 22, fontFamily: "Times-Roman", fontWeight: 700, marginTop: 4 },
  meta: { fontSize: 9, color: "#666", marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#eee" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: 10, color: "#444" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1.5, marginTop: 6 },
  grandTotalLabel: { fontSize: 15, fontFamily: "Times-Roman", fontWeight: 700 },
  statusBadge: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", marginTop: 6 },
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  sectionText: { fontSize: 9, color: "#444" },
});

export type InvoicePdfData = {
  businessName: string;
  companyAddress: string | null;
  vatNumber: string | null;
  bankDetails: string | null;
  logoUrl: string | null;
  brandColor: string;
  invoiceNumber: string | null;
  reference: string | null;
  milestone: string | null;
  clientName: string;
  amountPence: number;
  paidPence: number;
  dueDate: string;
  status: string;
};

export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  const outstanding = data.amountPence - data.paidPence;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.accentBar, { backgroundColor: data.brandColor }]} />
        <View style={styles.body}>
          <View style={styles.header}>
            <View>
              <Text style={styles.businessName}>{data.businessName}</Text>
              {data.companyAddress && <Text style={styles.businessMeta}>{data.companyAddress}</Text>}
              {data.vatNumber && <Text style={styles.businessMeta}>VAT: {data.vatNumber}</Text>}
            </View>
            {data.logoUrl && <Image src={data.logoUrl} style={styles.logo} />}
          </View>

          <Text style={[styles.eyebrow, { color: data.brandColor }]}>Invoice</Text>
          <Text style={styles.title}>{data.clientName}</Text>
          <Text style={styles.meta}>
            {data.invoiceNumber ?? ""}
            {data.milestone ? ` · ${data.milestone}` : ""}
            {data.reference ? ` · ${data.reference}` : ""}
          </Text>
          <Text style={styles.meta}>
            Due {new Date(data.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
          </Text>
          <Text style={[styles.statusBadge, { color: data.status === "paid" ? "#0ca30c" : data.brandColor }]}>
            {data.status.replace("_", " ")}
          </Text>

          <View style={{ marginTop: 20 }}>
            <View style={[styles.grandTotalRow, { borderTopColor: data.brandColor }]}>
              <Text style={styles.grandTotalLabel}>Amount</Text>
              <Text style={styles.grandTotalLabel}>{formatGBP(data.amountPence)}</Text>
            </View>
            {data.paidPence > 0 && (
              <>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Paid</Text>
                  <Text>{formatGBP(data.paidPence)}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Outstanding</Text>
                  <Text>{formatGBP(outstanding)}</Text>
                </View>
              </>
            )}
          </View>

          {data.bankDetails && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Payment details</Text>
              <Text style={styles.sectionText}>{data.bankDetails}</Text>
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
