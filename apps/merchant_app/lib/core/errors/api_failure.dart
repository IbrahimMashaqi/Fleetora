enum FailureKind {
  network,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validation,
  server,
  invalidResponse,
  sessionChanged,
}

class ApiFailure implements Exception {
  const ApiFailure(this.kind, {this.status});
  final FailureKind kind;
  final int? status;
  // Deliberately excludes server response content, credentials and request URLs.
  @override
  String toString() => 'ApiFailure(${kind.name}, $status)';
}
