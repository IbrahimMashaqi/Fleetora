import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// QR data is exactly the authenticated backend's tracking identity. No address,
/// customer details, credentials or financial fields enter a code or PDF.
Future<Uint8List> buildLabelPdf(
  List<String> trackingNumbers, {
  required String heading,
  required String notice,
  required bool arabic,
}) async {
  final fontData = await rootBundle.load(
    'assets/fonts/NotoSansArabic-Regular.ttf',
  );
  final arabicFont = pw.Font.ttf(fontData);
  final latinFont = pw.Font.helvetica();
  final document = pw.Document();
  for (final tracking in trackingNumbers) {
    document.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a6,
        margin: const pw.EdgeInsets.all(20),
        build: (_) => pw.Column(
          mainAxisAlignment: pw.MainAxisAlignment.center,
          crossAxisAlignment: pw.CrossAxisAlignment.center,
          children: [
            pw.Text(
              'Fleetora',
              style: pw.TextStyle(font: latinFont, fontSize: 20),
            ),
            pw.SizedBox(height: 12),
            pw.Text(
              heading,
              textDirection: arabic
                  ? pw.TextDirection.rtl
                  : pw.TextDirection.ltr,
              style: pw.TextStyle(
                font: arabic ? arabicFont : latinFont,
                fontSize: 14,
              ),
            ),
            pw.SizedBox(height: 16),
            pw.BarcodeWidget(
              data: tracking,
              barcode: pw.Barcode.qrCode(),
              width: 160,
              height: 160,
              drawText: false,
            ),
            pw.SizedBox(height: 16),
            pw.Text(
              tracking,
              textDirection: pw.TextDirection.ltr,
              textAlign: pw.TextAlign.center,
              style: pw.TextStyle(font: latinFont, fontSize: 11),
            ),
            pw.SizedBox(height: 16),
            pw.Text(
              notice,
              textAlign: pw.TextAlign.center,
              textDirection: arabic
                  ? pw.TextDirection.rtl
                  : pw.TextDirection.ltr,
              style: pw.TextStyle(
                font: arabic ? arabicFont : latinFont,
                fontSize: 9,
              ),
            ),
          ],
        ),
      ),
    );
  }
  return document.save();
}
