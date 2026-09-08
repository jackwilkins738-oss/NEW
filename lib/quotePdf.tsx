import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatGBP } from "@/lib/format";

const CATEGORY_LABEL: Record<string, string> = {
  materials: "Materials",
  labour: "Labour",
  subcontractors: "Subcontractors",
  other: "Other",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 48, height: 48, objectFit: "contain" },
  businessMeta: { fontSize: 8, color: "#666", marginTop: 2, maxWidth: 220 },
  eyebrow: { fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginTop: 16 },
  title: { fontSize: 20, fontWeight: 700, marginTop: 4 },
  meta: { fontSize: 9, color: "#666", marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#eee" },
  category: { fontSize: 8, color: "#888", textTransform: "uppercase" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: 10, color: "#444" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#1a1a1a", marginTop: 4 },
  grandTotalLabel: { fontSize: 13, fontWeight: 700 },
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  sectionText: { fontSize: 9, color: "#444" },
});

export type QuotePdfData = {
  businessName: string;
  companyAddress: string | null;
  vatNumber: string | null;
  logoUrl: string | null;
  quoteNumber: string | null;
  clientName: string;
  lineItems: { category: string; description: string; unit_price_pence: number }[];
  markupPercent: number;
  vatRate: number;
  vatAmountPence: number;
  totalPence: number;
  expiresAt: string | null;
  depositPence: number | null;
  paymentTerms: string | null;
  exclusions: string | null;
  terms: string | null;
};

export function QuotePdfDocument({ data }: { data: QuotePdfData }) {
  const saleSubtotal = data.totalPence - data.vatAmountPence;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: 700 }}>{data.businessName}</Text>
            {data.companyAddress && <Text style={styles.businessMeta}>{data.companyAddress}</Text>}
            {data.vatNumber && <Text style={styles.businessMeta}>VAT: {data.vatNumber}</Text>}
          </View>
          {data.logoUrl && <Image src={data.logoUrl} style={styles.logo} />}
        </View>

        <Text style={styles.eyebrow}>Quote from {data.businessName}</Text>
        <Text style={styles.title}>{data.clientName}</Text>
        {data.quoteNumber && <Text style={styles.meta}>{data.quoteNumber}</Text>}

        <View style={{ marginTop: 20 }}>
          {data.lineItems.map((item, i) => (
            <View key={i} style={styles.row}>
              <View>
                <Text style={styles.category}>{CATEGORY_LABEL[item.category] ?? "Other"}</Text>
                <Text>{item.description || "-"}</Text>
              </View>
              <Text>{formatGBP(item.unit_price_pence)}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 8 }}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text>{formatGBP(saleSubtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>VAT ({data.vatRate}%)</Text>
            <Text>{formatGBP(data.vatAmountPence)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalLabel}>{formatGBP(data.totalPence)}</Text>
          </View>
          {data.depositPence != null && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Deposit required</Text>
              <Text>{formatGBP(data.depositPence)}</Text>
            </View>
          )}
        </View>

        {data.expiresAt && (
          <Text style={{ ...styles.meta, marginTop: 12 }}>
            Valid until {new Date(data.expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
          </Text>
        )}

        {data.paymentTerms && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Payment terms</Text>
            <Text style={styles.sectionText}>{data.paymentTerms}</Text>
          </View>
        )}
        {data.exclusions && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Exclusions</Text>
            <Text style={styles.sectionText}>{data.exclusions}</Text>
          </View>
        )}
        {data.terms && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Terms &amp; conditions</Text>
            <Text style={styles.sectionText}>{data.terms}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
