import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const String baseUrl = 'https://team12.me/api';

Future<Map<String, String>> authHeaders() async {
  final token = await getToken();
  return {
    'Content-Type': 'application/json',
    if (token != null) 'Authorization': 'Bearer $token',
  };
}

Future<Map<String, dynamic>> checkCanvasSync() async {
  final res = await http.post(
    Uri.parse('$baseUrl/canvas/check-sync'),
    headers: await authHeaders(),
  );
  return jsonDecode(res.body);
}

Future<void> clearToken() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove('token');
}

Future<Map<String, dynamic>> createAssignment(Map<String, dynamic> data) async {
  final res = await http.post(
    Uri.parse('$baseUrl/assignments'),
    headers: await authHeaders(),
    body: jsonEncode(data),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> createCourse(Map<String, dynamic> data) async {
  final res = await http.post(
    Uri.parse('$baseUrl/courses'),
    headers: await authHeaders(),
    body: jsonEncode(data),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> deleteAccount(String password) async {
  final res = await http.delete(
    Uri.parse('$baseUrl/auth/account'),
    headers: await authHeaders(),
    body: jsonEncode({'password': password}),
  );
  return jsonDecode(res.body);
}

Future<void> deleteAssignment(String id) async {
  await http.delete(
    Uri.parse('$baseUrl/assignments/$id'),
    headers: await authHeaders(),
  );
}

Future<void> deleteCourse(String id) async {
  await http.delete(
    Uri.parse('$baseUrl/courses/$id'),
    headers: await authHeaders(),
  );
}

Future<void> disconnectCanvas() async {
  await http.delete(
    Uri.parse('$baseUrl/canvas/settings'),
    headers: await authHeaders(),
  );
}

Future<Map<String, dynamic>> forgotPassword(String email) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/forgot-password'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email}),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> generatePlan(String weekStart) async {
  final res = await http.post(
    Uri.parse('$baseUrl/planner/generate'),
    headers: await authHeaders(),
    body: jsonEncode({'weekStart': weekStart}),
  );
  return jsonDecode(res.body);
}

// ─── ASSIGNMENTS ─────────────────────────────────────────────────────────────

Future<List<dynamic>> getAssignments() async {
  final res = await http.get(
    Uri.parse('$baseUrl/assignments'),
    headers: await authHeaders(),
  );
  return jsonDecode(res.body);
}

// ─── CANVAS ──────────────────────────────────────────────────────────────────

Future<Map<String, dynamic>> getCanvasSettings() async {
  final res = await http.get(
    Uri.parse('$baseUrl/canvas/settings'),
    headers: await authHeaders(),
  );
  return jsonDecode(res.body);
}

// ─── COURSES ─────────────────────────────────────────────────────────────────

Future<List<dynamic>> getCourses() async {
  final res = await http.get(
    Uri.parse('$baseUrl/courses'),
    headers: await authHeaders(),
  );
  return jsonDecode(res.body);
}

// ─── STUDY PLANNER ───────────────────────────────────────────────────────────

Future<Map<String, dynamic>> getPlannerPreferences() async {
  final res = await http.get(
    Uri.parse('$baseUrl/planner/preferences'),
    headers: await authHeaders(),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> getPreferences() async {
  final res = await http.get(
    Uri.parse('$baseUrl/auth/preferences'),
    headers: await authHeaders(),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> getSchedule(String weekStart) async {
  final res = await http.get(
    Uri.parse('$baseUrl/planner/schedule?weekStart=$weekStart'),
    headers: await authHeaders(),
  );
  return jsonDecode(res.body);
}

Future<String?> getToken() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString('token');
}

Future<Map<String, dynamic>?> getUser() async {
  final prefs = await SharedPreferences.getInstance();
  final str = prefs.getString('user');
  if (str == null) return null;
  return jsonDecode(str);
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

Future<Map<String, dynamic>> login(String email, String password) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/login'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email, 'password': password}),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> register(String name, String email, String password) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/register'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'name': name, 'email': email, 'password': password}),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> resetPassword(String email, String code, String newPassword) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/reset-password'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email, 'code': code, 'newPassword': newPassword}),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> saveCanvasSettings(Map<String, dynamic> data) async {
  final res = await http.post(
    Uri.parse('$baseUrl/canvas/settings'),
    headers: await authHeaders(),
    body: jsonEncode(data),
  );
  return jsonDecode(res.body);
}

// ─── TOKEN HELPERS ───────────────────────────────────────────────────────────

Future<void> saveToken(String token) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('token', token);
}

Future<void> saveUser(Map<String, dynamic> user) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString('user', jsonEncode(user));
}

Future<Map<String, dynamic>> sendCode(String email) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/send-code'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email}),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> syncCanvas() async {
  final res = await http.post(
    Uri.parse('$baseUrl/canvas/sync'),
    headers: await authHeaders(),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> updateAccount(Map<String, dynamic> data) async {
  final res = await http.put(
    Uri.parse('$baseUrl/auth/account'),
    headers: await authHeaders(),
    body: jsonEncode(data),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> updateAssignment(String id, Map<String, dynamic> data) async {
  final res = await http.put(
    Uri.parse('$baseUrl/assignments/$id'),
    headers: await authHeaders(),
    body: jsonEncode(data),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> updateCourse(String id, Map<String, dynamic> data) async {
  final res = await http.put(
    Uri.parse('$baseUrl/courses/$id'),
    headers: await authHeaders(),
    body: jsonEncode(data),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> updatePlannerPreferences(Map<String, dynamic> data) async {
  final res = await http.put(
    Uri.parse('$baseUrl/planner/preferences'),
    headers: await authHeaders(),
    body: jsonEncode(data),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> updatePreferences(Map<String, dynamic> data) async {
  final res = await http.put(
    Uri.parse('$baseUrl/auth/preferences'),
    headers: await authHeaders(),
    body: jsonEncode(data),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> updateSession(String sessionId, Map<String, dynamic> data) async {
  final res = await http.patch(
    Uri.parse('$baseUrl/planner/schedule/$sessionId'),
    headers: await authHeaders(),
    body: jsonEncode(data),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> updateSyncFrequency(String frequency) async {
  final res = await http.put(
    Uri.parse('$baseUrl/canvas/settings/frequency'),
    headers: await authHeaders(),
    body: jsonEncode({'syncFrequency': frequency}),
  );
  return jsonDecode(res.body);
}

Future<Map<String, dynamic>> verifyCode(String email, String code) async {
  final res = await http.post(
    Uri.parse('$baseUrl/auth/verify-code'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email, 'code': code}),
  );
  return jsonDecode(res.body);
}