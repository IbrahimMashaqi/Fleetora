import 'dart:convert';

import 'package:fleetora_merchant/features/labels/label_pdf.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'Arabic bulk labels create real PDF pages with an embedded font',
    () async {
      final bytes = await buildLabelPdf(
        ['FL-FIRST', 'FL-SECOND'],
        heading: 'ملصق الطرد',
        notice: 'المسح لا يثبت الاستلام الفعلي.',
        arabic: true,
      );
      final source = latin1.decode(bytes);
      expect(source.startsWith('%PDF-'), isTrue);
      expect(RegExp(r'/Type\s*/Page\b').allMatches(source), hasLength(2));
      expect(source.contains('/FontFile2'), isTrue);
    },
  );
}
