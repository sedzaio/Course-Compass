import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:table_calendar/table_calendar.dart';

import 'api_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  final token = await getToken();
  runApp(MyApp(isLoggedIn: token != null));
}

// ─── ADD ASSIGNMENT DIALOG ───────────────────────────────────────────────────

Future<void> showAddAssignmentDialog(BuildContext context, VoidCallback onDone) async {
  final titleController = TextEditingController();
  final descriptionController = TextEditingController();
  final estimatedHrsController = TextEditingController();
  List<dynamic> courses = [];
  String? selectedCourseId;
  String selectedType = 'assignment';
  DateTime? selectedDueDate;

  try { courses = await getCourses(); } catch (_) {}

  if (!context.mounted) return;
  await showDialog(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('NEW ASSIGNMENT', style: TextStyle(fontSize: 11, color: Colors.blue, fontWeight: FontWeight.bold, letterSpacing: 1)),
            Text('Add Assignment', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Title *', style: TextStyle(fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              TextField(controller: titleController, decoration: const InputDecoration(hintText: 'e.g. Chapter 5 Reading', border: OutlineInputBorder())),
              const SizedBox(height: 16),
              const Text('Due Date & Time', style: TextStyle(fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              InkWell(
                onTap: () async {
                  final date = await showDatePicker(context: ctx, initialDate: DateTime.now(), firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)));
                  if (date != null) setState(() => selectedDueDate = date);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                  decoration: BoxDecoration(border: Border.all(color: Colors.grey), borderRadius: BorderRadius.circular(4)),
                  child: Row(
                    children: [
                      const Icon(Icons.calendar_today, size: 16, color: Colors.grey),
                      const SizedBox(width: 8),
                      Text(selectedDueDate != null ? '${selectedDueDate!.year}-${selectedDueDate!.month.toString().padLeft(2,'0')}-${selectedDueDate!.day.toString().padLeft(2,'0')}' : 'mm/dd/yyyy', style: TextStyle(color: selectedDueDate != null ? Colors.black : Colors.grey)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text('Estimated Time', style: TextStyle(fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              TextField(controller: estimatedHrsController, decoration: const InputDecoration(hintText: 'hrs', border: OutlineInputBorder()), keyboardType: TextInputType.number),
              const SizedBox(height: 16),
              const Text('Course', style: TextStyle(fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                decoration: const InputDecoration(border: OutlineInputBorder()),
                hint: const Text('— Personal task —'),
                items: courses.map<DropdownMenuItem<String>>((c) => DropdownMenuItem(value: c['_id'].toString(), child: Text(c['title']))).toList(),
                onChanged: (val) => setState(() => selectedCourseId = val),
              ),
              const SizedBox(height: 16),
              const Text('Type', style: TextStyle(fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                initialValue: selectedType,
                decoration: const InputDecoration(border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: 'assignment', child: Text('Assignment')),
                  DropdownMenuItem(value: 'quiz', child: Text('Quiz')),
                  DropdownMenuItem(value: 'exam', child: Text('Exam')),
                  DropdownMenuItem(value: 'project', child: Text('Project')),
                  DropdownMenuItem(value: 'reading', child: Text('Reading')),
                  DropdownMenuItem(value: 'other', child: Text('Other')),
                ],
                onChanged: (val) => setState(() => selectedType = val ?? 'assignment'),
              ),
              const SizedBox(height: 16),
              const Text('Notes', style: TextStyle(fontWeight: FontWeight.w500)),
              const SizedBox(height: 6),
              TextField(controller: descriptionController, decoration: const InputDecoration(hintText: 'Optional notes...', border: OutlineInputBorder()), maxLines: 3),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (titleController.text.isEmpty) return;
              await createAssignment({
                'title': titleController.text,
                'type': selectedType,
                'description': descriptionController.text,
                'courseId': ?selectedCourseId,
                if (selectedDueDate != null) 'dueDate': selectedDueDate!.toIso8601String(),
                if (estimatedHrsController.text.isNotEmpty) 'estimatedTime': double.tryParse(estimatedHrsController.text),
              });
              if (!ctx.mounted) return;
              Navigator.pop(ctx);
              onDone();
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4A90B8), foregroundColor: Colors.white),
            child: const Text('Add'),
          ),
        ],
      ),
    ),
  );
}

// ─── ASSIGNMENT CARD ─────────────────────────────────────────────────────────

class AssignmentCard extends StatelessWidget {
  final Map<String, dynamic> assignment;
  final VoidCallback onUpdate;
  const AssignmentCard({super.key, required this.assignment, required this.onUpdate});

  @override
  Widget build(BuildContext context) {
    final course = assignment['courseId'];
    final colorHex = course?['color'] ?? '#4A90B8';
    final color = Color(int.parse(colorHex.replaceFirst('#', '0xFF')));
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Checkbox(
          value: assignment['completed'] ?? false,
          onChanged: (val) async {
            await updateAssignment(assignment['_id'], {'completed': val});
            onUpdate();
          },
        ),
        title: Text(assignment['title'] ?? '', style: TextStyle(decoration: assignment['completed'] == true ? TextDecoration.lineThrough : null)),
        subtitle: course != null ? Text(course['title'] ?? '', style: TextStyle(color: color)) : null,
        trailing: assignment['dueDate'] != null
            ? Text(assignment['dueDate'].toString().substring(0, 10), style: const TextStyle(fontSize: 12, color: Colors.grey))
            : null,
      ),
    );
  }
}

// ─── CANVAS SETTINGS ─────────────────────────────────────────────────────────

class CanvasSettingsScreen extends StatefulWidget {
  const CanvasSettingsScreen({super.key});

  @override
  State<CanvasSettingsScreen> createState() => _CanvasSettingsScreenState();
}

// ─── COURSES ─────────────────────────────────────────────────────────────────

class CoursesScreen extends StatefulWidget {
  const CoursesScreen({super.key});

  @override
  State<CoursesScreen> createState() => _CoursesScreenState();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

// ─── FORGOT PASSWORD ─────────────────────────────────────────────────────────

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

// ─── MAIN SHELL (Bottom Nav) ─────────────────────────────────────────────────

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class MyApp extends StatelessWidget {
  final bool isLoggedIn;
  const MyApp({super.key, required this.isLoggedIn});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Course Compass',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF4A90B8)),
        scaffoldBackgroundColor: const Color(0xFFF5F5F5),
        useMaterial3: true,
      ),
      home: isLoggedIn ? const MainShell() : const LoginScreen(),
    );
  }
}

// ─── REGISTER ────────────────────────────────────────────────────────────────

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

// ─── STUDY PLANNER ───────────────────────────────────────────────────────────

class StudyPlannerScreen extends StatefulWidget {
  const StudyPlannerScreen({super.key});

  @override
  State<StudyPlannerScreen> createState() => _StudyPlannerScreenState();
}

class _CanvasSettingsScreenState extends State<CanvasSettingsScreen> {
  final tokenController = TextEditingController();
  final urlController = TextEditingController();
  String syncFrequency = 'daily';
  Map<String, dynamic>? settings;
  bool loading = true;
  bool saving = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Canvas LMS')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (settings?['connected'] == true) ...[
                    const Text('Status: Connected ✅', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Text('Last synced: ${settings?['lastSynced'] ?? 'Never'}', style: const TextStyle(color: Colors.grey)),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(onPressed: handleSync, icon: const Icon(Icons.sync), label: const Text('Sync Now'), style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4A90B8), foregroundColor: Colors.white)),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      onPressed: () async {
                        await disconnectCanvas();
                        loadSettings();
                      },
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                      child: const Text('Disconnect Canvas'),
                    ),
                    const Divider(height: 32),
                  ],
                  TextField(controller: urlController, decoration: const InputDecoration(labelText: 'Canvas URL (e.g. https://ucf.instructure.com)', border: OutlineInputBorder())),
                  const SizedBox(height: 16),
                  TextField(controller: tokenController, decoration: const InputDecoration(labelText: 'Canvas API Token', border: OutlineInputBorder()), obscureText: true),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: syncFrequency,
                    decoration: const InputDecoration(labelText: 'Sync Frequency', border: OutlineInputBorder()),
                    items: const [
                      DropdownMenuItem(value: 'manual', child: Text('Manual')),
                      DropdownMenuItem(value: 'daily', child: Text('Daily')),
                      DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
                    ],
                    onChanged: (val) => setState(() => syncFrequency = val ?? 'daily'),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: saving ? null : handleSave,
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4A90B8), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: Text(saving ? 'Saving...' : 'Save Settings'),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Future<void> handleSave() async {
    setState(() => saving = true);
    try {
      await saveCanvasSettings({'canvasToken': tokenController.text, 'canvasUrl': urlController.text, 'syncFrequency': syncFrequency});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(backgroundColor: Colors.red, content: Text('Canvas settings saved!')));
      loadSettings();
    } finally {
      setState(() => saving = false);
    }
  }

  Future<void> handleSync() async {
    try {
      final data = await syncCanvas();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(backgroundColor: Colors.red, content: Text('Sync complete! ${data['count'] ?? 0} assignments imported.')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(backgroundColor: Colors.red, content: Text('Sync failed')));
    }
  }

  @override
  void initState() {
    super.initState();
    loadSettings();
  }

  Future<void> loadSettings() async {
    try {
      final data = await getCanvasSettings();
      setState(() {
        settings = data;
        urlController.text = data['canvasUrl'] ?? '';
        syncFrequency = data['syncFrequency'] ?? 'daily';
        loading = false;
      });
    } catch (e) {
      setState(() => loading = false);
    }
  }
}

class _CoursesScreenState extends State<CoursesScreen> {
  List<dynamic> courses = [];
  bool loading = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Courses', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 1,
        actions: [
          IconButton(icon: const Icon(Icons.add), onPressed: showAddCourseDialog),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : courses.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.book_outlined, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text('No courses yet', style: TextStyle(fontWeight: FontWeight.bold)),
                      Text('Add a course above or sync from Canvas in Settings.', style: TextStyle(color: Colors.grey)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: loadCourses,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: courses.length,
                    itemBuilder: (ctx, i) {
                      final c = courses[i];
                      final colorHex = c['color'] ?? '#4A90B8';
                      final color = Color(int.parse(colorHex.replaceFirst('#', '0xFF')));
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: CircleAvatar(backgroundColor: color, child: Text(c['title']?.substring(0, 1) ?? 'C', style: const TextStyle(color: Colors.white))),
                          title: Text(c['title'] ?? ''),
                          subtitle: Text('${c['code'] ?? ''} • ${c['semester'] ?? ''}'),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete, color: Colors.red),
                            onPressed: () async {
                              await deleteCourse(c['_id']);
                              loadCourses();
                            },
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  @override
  void initState() {
    super.initState();
    loadCourses();
  }

  Future<void> loadCourses() async {
    try {
      final data = await getCourses();
      setState(() { courses = data; loading = false; });
    } catch (e) {
      setState(() => loading = false);
    }
  }

  void showAddCourseDialog() {
    final titleController = TextEditingController();
    final codeController = TextEditingController();
    final instructorController = TextEditingController();
    final semesterController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add Course'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: titleController, decoration: const InputDecoration(labelText: 'Title', border: OutlineInputBorder())),
              const SizedBox(height: 12),
              TextField(controller: codeController, decoration: const InputDecoration(labelText: 'Code (e.g. COP3530)', border: OutlineInputBorder())),
              const SizedBox(height: 12),
              TextField(controller: instructorController, decoration: const InputDecoration(labelText: 'Instructor', border: OutlineInputBorder())),
              const SizedBox(height: 12),
              TextField(controller: semesterController, decoration: const InputDecoration(labelText: 'Semester (e.g. Spring 2026)', border: OutlineInputBorder())),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              await createCourse({'title': titleController.text, 'code': codeController.text, 'instructor': instructorController.text, 'semester': semesterController.text, 'color': '#4A90B8'});
              if (!ctx.mounted) return;
              Navigator.pop(ctx);
              loadCourses();
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _isCalendarView = false;
  List<dynamic> assignments = [];
  Map<String, dynamic>? user;
  bool loading = true;

  @override
  Widget build(BuildContext context) {
    final pending = assignments.where((a) => a['completed'] != true).toList();
    return Scaffold(
      appBar: AppBar(
        title: Image.asset('assets/images/logo2.png', height: 32),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 1,
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: loadData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Welcome card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: const Color(0xFF4A90B8),
                            child: Text(user?['name']?.substring(0, 1).toUpperCase() ?? 'U', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Good afternoon, ${user?['name']?.split(' ')[0] ?? 'there'}!', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                                const Text('Track your assignments and stay on top of your week.', style: TextStyle(color: Colors.grey, fontSize: 12)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // AI Study Plan card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Icon(Icons.auto_awesome, size: 14, color: Colors.blue),
                                SizedBox(width: 4),
                                Text('AI-POWERED', style: TextStyle(fontSize: 11, color: Colors.blue, fontWeight: FontWeight.bold)),
                              ]),
                              SizedBox(height: 4),
                              Text('Study Plan', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              Text('No plan yet for this week.', style: TextStyle(color: Colors.grey, fontSize: 12)),
                            ],
                          ),
                          ElevatedButton.icon(
                            onPressed: () {},
                            icon: const Icon(Icons.auto_awesome, size: 14),
                            label: const Text('Generate Plan'),
                            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4A90B8), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Filter chips
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _filterChip('Overdue', assignments.where((a) => a['completed'] != true && a['dueDate'] != null && DateTime.tryParse(a['dueDate'] ?? '')?.isBefore(DateTime.now()) == true).length, Colors.red),
                      _filterChip('This week', assignments.where((a) => a['completed'] != true).length, Colors.blue),
                      _filterChip('Next week', 0, Colors.blue),
                      _filterChip('Pending', assignments.where((a) => a['completed'] != true).length, Colors.orange),
                      _filterChip('Completed', assignments.where((a) => a['completed'] == true).length, Colors.green),
                      _filterChip('No due date', assignments.where((a) => a['dueDate'] == null).length, Colors.grey),
                      _filterChip('All', assignments.length, Colors.grey),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // Assignments header
                  // List/Calendar toggle + Add button
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Assignments', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                          Text('${assignments.where((a) => a['completed'] != true).length} pending', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                        ],
                      ),
                      ElevatedButton.icon(
                        onPressed: () => showAddAssignmentDialog(context, loadData),
                        icon: const Icon(Icons.add, size: 16),
                        label: const Text('Add'),
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4A90B8), foregroundColor: Colors.white),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  // Toggle buttons
                  Row(
                    children: [
                      GestureDetector(
                        onTap: () => setState(() => _isCalendarView = false),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: !_isCalendarView ? const Color(0xFF4A90B8) : Colors.transparent,
                            borderRadius: const BorderRadius.horizontal(left: Radius.circular(8)),
                            border: Border.all(color: const Color(0xFF4A90B8)),
                          ),
                          child: Row(children: [
                            Icon(Icons.list, size: 16, color: !_isCalendarView ? Colors.white : const Color(0xFF4A90B8)),
                            const SizedBox(width: 4),
                            Text('List', style: TextStyle(color: !_isCalendarView ? Colors.white : const Color(0xFF4A90B8), fontSize: 13)),
                          ]),
                        ),
                      ),
                      GestureDetector(
                        onTap: () => setState(() => _isCalendarView = true),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: _isCalendarView ? const Color(0xFF4A90B8) : Colors.transparent,
                            borderRadius: const BorderRadius.horizontal(right: Radius.circular(8)),
                            border: Border.all(color: const Color(0xFF4A90B8)),
                          ),
                          child: Row(children: [
                            Icon(Icons.calendar_today, size: 16, color: _isCalendarView ? Colors.white : const Color(0xFF4A90B8)),
                            const SizedBox(width: 4),
                            Text('Calendar', style: TextStyle(color: _isCalendarView ? Colors.white : const Color(0xFF4A90B8), fontSize: 13)),
                          ]),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  // Content
                  if (_isCalendarView)
                    Card(
                      child: TableCalendar(
                        focusedDay: DateTime.now(),
                        firstDay: DateTime(2024),
                        lastDay: DateTime(2027),
                      ),
                    )
                  else if (assignments.where((a) => a['completed'] != true).isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(32),
                        child: Column(
                          children: [
                            Icon(Icons.check_box_outlined, size: 48, color: Colors.grey),
                            SizedBox(height: 8),
                            Text('All clear this week!', style: TextStyle(fontWeight: FontWeight.bold)),
                            Text('No assignments due this week.', style: TextStyle(color: Colors.grey)),
                          ],
                        ),
                      ),
                    )
                  else
                    ...assignments.where((a) => a['completed'] != true).map((a) => AssignmentCard(assignment: a, onUpdate: loadData)),
                  
                ],
              ),
            ),
    );
  }

  @override
  void initState() {
    super.initState();
    loadData();
  }

  Future<void> loadData() async {
    try {
      final u = await getUser();
      final a = await getAssignments();
      setState(() { user = u; assignments = a; loading = false; });
    } catch (e) {
      setState(() => loading = false);
    }
  }

  Widget _filterChip(String label, int count, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        border: Border.all(color: color.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text('$count  $label', style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w500)),
    );
  }
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final emailController = TextEditingController();
  final codeController = TextEditingController();
  final newPasswordController = TextEditingController();
  String step = 'email';
  bool loading = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Forgot Password')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            TextField(controller: emailController, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()), keyboardType: TextInputType.emailAddress),
            const SizedBox(height: 16),
            if (step == 'reset') ...[
              TextField(controller: codeController, decoration: const InputDecoration(labelText: '6-digit code', border: OutlineInputBorder()), keyboardType: TextInputType.number),
              const SizedBox(height: 16),
              TextField(controller: newPasswordController, decoration: const InputDecoration(labelText: 'New Password', border: OutlineInputBorder()), obscureText: true),
              const SizedBox(height: 16),
            ],
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: loading ? null : (step == 'email' ? handleSendCode : handleReset),
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4A90B8), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14)),
                child: Text(loading ? 'Loading...' : (step == 'email' ? 'Send Reset Code' : 'Reset Password')),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> handleReset() async {
    setState(() => loading = true);
    try {
      final data = await resetPassword(emailController.text.trim(), codeController.text.trim(), newPasswordController.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(backgroundColor: Colors.red, content: Text(data['message'] ?? 'Password reset!')));
      Navigator.pop(context);
    } finally {
      setState(() => loading = false);
    }
  }

  Future<void> handleSendCode() async {
    if (!emailController.text.contains('@')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(backgroundColor: Colors.red, content: Text("Please include an '@' in the email address.")),
      );
      return;
    }
    setState(() => loading = true);
    try {
      await forgotPassword(emailController.text.trim());
      setState(() => step = 'reset');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(backgroundColor: Colors.red, content: Text('Reset code sent to email')));
    } finally {
      setState(() => loading = false);
    }
  }
}

class _LoginScreenState extends State<LoginScreen> {
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  bool loading = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            elevation: 4,
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Image.asset('assets/images/logo.png', height: 80),
                  const SizedBox(height: 8),
                  const Text('Course Compass', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  const Text('Login', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 24),
                  TextField(controller: emailController, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()), keyboardType: TextInputType.emailAddress),
                  const SizedBox(height: 16),
                  TextField(controller: passwordController, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()), obscureText: true),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ForgotPasswordScreen())),
                      child: const Text('Forgot password?'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: loading ? null : handleLogin,
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4A90B8), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: Text(loading ? 'Logging in...' : 'Login'),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RegisterScreen())),
                    child: const Text("Don't have an account? Register"),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> handleLogin() async {
    if (!emailController.text.contains('@')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(backgroundColor: Colors.red, content: Text("Please include an '@' in the email address.")),
      );
      return;
    }

    setState(() => loading = true);
    try {
      final data = await login(emailController.text.trim(), passwordController.text);
      if (data['token'] != null) {
        await saveToken(data['token']);
        await saveUser(data['user']);
        if (!mounted) return;
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const MainShell()));
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(backgroundColor: Colors.red, content: Text(data['message'] ?? 'Login failed')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(backgroundColor: Colors.red, content: Text('Something went wrong')));
    } finally {
      setState(() => loading = false);
    }
  }
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    DashboardScreen(),
    CoursesScreen(),
    StudyPlannerScreen(),
    SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (i) => setState(() => _currentIndex = i),
        type: BottomNavigationBarType.fixed,
        selectedItemColor: const Color(0xFF4A90B8),
        unselectedItemColor: Colors.grey,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Dashboard'),
          BottomNavigationBarItem(icon: Icon(Icons.book), label: 'Courses'),
          BottomNavigationBarItem(icon: Icon(Icons.calendar_today), label: 'Planner'),
          BottomNavigationBarItem(icon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }
}

class _RegisterScreenState extends State<RegisterScreen> {
  final nameController = TextEditingController();
  final emailController = TextEditingController();
  final codeController = TextEditingController();
  final passwordController = TextEditingController();
  final retypeController = TextEditingController();
  String step = 'form';
  bool loading = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            elevation: 4,
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Image.asset('assets/images/logo.png', height: 80),
                  const Text('Course Compass', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                  const Text('Create Account', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 24),
                  TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Full Name', border: OutlineInputBorder())),
                  const SizedBox(height: 12),
                  TextField(controller: emailController, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()), keyboardType: TextInputType.emailAddress),
                  const SizedBox(height: 12),
                  if (step == 'form')
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: loading ? null : handleSendCode,
                        child: Text(loading ? 'Sending...' : 'Get Verification Code'),
                      ),
                    ),
                  if (step == 'verify') ...[
                    const SizedBox(height: 12),
                    TextField(controller: codeController, decoration: const InputDecoration(labelText: 'Verification Code', border: OutlineInputBorder()), keyboardType: TextInputType.number),
                  ],
                  const SizedBox(height: 12),
                  TextField(controller: passwordController, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()), obscureText: true),
                  const SizedBox(height: 12),
                  TextField(controller: retypeController, decoration: const InputDecoration(labelText: 'Retype Password', border: OutlineInputBorder()), obscureText: true),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: loading || step == 'form' ? null : handleRegister,
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4A90B8), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: Text(loading ? 'Creating...' : 'Create Account'),
                    ),
                  ),
                  TextButton(onPressed: () => Navigator.pop(context), child: const Text('Already have an account? Login')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> handleRegister() async {
    if (passwordController.text != retypeController.text) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(backgroundColor: Colors.red, content: Text('Passwords do not match')));
      return;
    }
    setState(() => loading = true);
    try {
      final verifyData = await verifyCode(emailController.text.trim(), codeController.text.trim());
      if (verifyData['verified'] != true) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(backgroundColor: Colors.red, content: Text(verifyData['message'] ?? 'Invalid code')));
        return;
      }
      final data = await register(nameController.text.trim(), emailController.text.trim(), passwordController.text);
      if (!mounted) return;
      if (data['message'] != null && data['message'].toString().contains('complete')) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(backgroundColor: Colors.red, content: Text('Account created! Please login.')));
        Navigator.pop(context);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(backgroundColor: Colors.red, content: Text(data['message'] ?? 'Error')));
      }
    } finally {
      setState(() => loading = false);
    }
  }

  Future<void> handleSendCode() async {
    setState(() => loading = true);
    try {
      final data = await sendCode(emailController.text.trim());
      if (!mounted) return;
      if (data['message'] != null && data['message'].toString().contains('sent')) {
        setState(() => step = 'verify');
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(backgroundColor: Colors.red, content: Text('Verification code sent!')));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(backgroundColor: Colors.red, content: Text(data['message'] ?? 'Error')));
      }
    } finally {
      setState(() => loading = false);
    }
  }
}

class _SettingsScreenState extends State<SettingsScreen> {
  Map<String, dynamic>? user;
  Map<String, dynamic>? canvasSettings;
  bool loading = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 1,
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: [
                const Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, 8), child: Text('ACCOUNT', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey))),
                Card(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    children: [
                      _settingsTile('Edit Profile', user?['name'] ?? '', Icons.person, () {}),
                      const Divider(height: 1),
                      _settingsTile('Email', user?['email'] ?? '', Icons.email, () {}),
                      const Divider(height: 1),
                      _settingsTile('Change Password', '••••••••', Icons.lock, () {}),
                    ],
                  ),
                ),
                const Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, 8), child: Text('INTEGRATIONS', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey))),
                Card(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  child: _settingsTile(
                    'Canvas LMS',
                    canvasSettings?['connected'] == true ? 'Connected' : 'Not connected',
                    Icons.sync,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CanvasSettingsScreen())).then((_) => loadData()),
                  ),
                ),
                const Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, 8), child: Text('DANGER ZONE', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.red))),
                Card(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  child: ListTile(
                    leading: const Icon(Icons.warning, color: Colors.red),
                    title: const Text('Close Account', style: TextStyle(color: Colors.red)),
                    subtitle: const Text('Permanently delete your account and all data', style: TextStyle(fontSize: 12)),
                    onTap: () => showDeleteAccountDialog(context),
                  ),
                ),
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: ElevatedButton(
                    onPressed: () async {
                      await clearToken();
                      if (!mounted) return;
                      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
                    },
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.grey.shade200, foregroundColor: Colors.black),
                    child: const Text('Log Out'),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
    );
  }

  @override
  void initState() {
    super.initState();
    loadData();
  }

  Future<void> loadData() async {
    try {
      final u = await getUser();
      Map<String, dynamic>? canvas;
      try { canvas = await getCanvasSettings(); } catch (_) {}
      setState(() { user = u; canvasSettings = canvas; loading = false; });
    } catch (e) {
      setState(() => loading = false);
    }
  }

  void showDeleteAccountDialog(BuildContext context) {
    final passwordController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Close Account', style: TextStyle(color: Colors.red)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('This will permanently delete your account and ALL data. Enter your password to confirm.'),
            const SizedBox(height: 16),
            TextField(controller: passwordController, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()), obscureText: true),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              await deleteAccount(passwordController.text);
              await clearToken();
              if (!ctx.mounted) return;
              Navigator.pushReplacement(ctx, MaterialPageRoute(builder: (_) => const LoginScreen()));
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            child: const Text('Delete Account'),
          ),
        ],
      ),
    );
  }

  Widget _settingsTile(String title, String subtitle, IconData icon, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: const Color(0xFF4A90B8)),
      title: Text(title),
      subtitle: Text(subtitle, style: const TextStyle(color: Colors.grey, fontSize: 12)),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}

class _StudyPlannerScreenState extends State<StudyPlannerScreen> {
  Map<String, dynamic>? schedule;
  bool loading = true;
  bool generating = false;
  DateTime weekStart = DateTime.now();

  @override
  Widget build(BuildContext context) {
    final sessions = schedule?['sessions'] as List<dynamic>? ?? [];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Study Planner', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 1,
        actions: [
          TextButton.icon(
            onPressed: generating ? null : handleGenerate,
            icon: const Icon(Icons.auto_awesome),
            label: Text(generating ? 'Generating...' : 'Generate Plan'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(icon: const Icon(Icons.chevron_left), onPressed: () { weekStart = weekStart.subtract(const Duration(days: 7)); loadSchedule(); }),
                Text('${_formatDate(weekStart)} – ${_formatDate(weekStart.add(const Duration(days: 6)))}', style: const TextStyle(fontWeight: FontWeight.bold)),
                IconButton(icon: const Icon(Icons.chevron_right), onPressed: () { weekStart = weekStart.add(const Duration(days: 7)); loadSchedule(); }),
              ],
            ),
          ),
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : sessions.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.auto_awesome, size: 64, color: Colors.grey),
                            const SizedBox(height: 16),
                            const Text('No study plan yet for this week', style: TextStyle(fontWeight: FontWeight.bold)),
                            const SizedBox(height: 8),
                            ElevatedButton.icon(
                              onPressed: generating ? null : handleGenerate,
                              icon: const Icon(Icons.auto_awesome),
                              label: Text(generating ? 'Generating...' : 'Generate Plan'),
                              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4A90B8), foregroundColor: Colors.white),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: sessions.length,
                        itemBuilder: (ctx, i) {
                          final s = sessions[i];
                          final colorHex = s['courseColor'] ?? '#4A90B8';
                          final color = Color(int.parse(colorHex.replaceFirst('#', '0xFF')));
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: CircleAvatar(backgroundColor: color, radius: 20, child: Text('${s['duration']}h', style: const TextStyle(color: Colors.white, fontSize: 12))),
                              title: Text(s['assignmentTitle'] ?? ''),
                              subtitle: Text('${s['courseTitle'] ?? ''} • ${s['date']} ${s['startTime']}–${s['endTime']}'),
                              trailing: Checkbox(
                                value: s['completed'] ?? false,
                                onChanged: (val) async {
                                  await updateSession(s['_id'], {'completed': val});
                                  loadSchedule();
                                },
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Future<void> handleGenerate() async {
    setState(() => generating = true);
    try {
      final data = await generatePlan(_formatDate(weekStart));
      setState(() { schedule = data; generating = false; });
    } catch (e) {
      setState(() => generating = false);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(backgroundColor: Colors.red, content: Text('Failed to generate plan')));
    }
  }

  @override
  void initState() {
    super.initState();
    weekStart = _getMonday(DateTime.now());
    loadSchedule();
  }

  Future<void> loadSchedule() async {
    setState(() => loading = true);
    try {
      final data = await getSchedule(_formatDate(weekStart));
      setState(() { schedule = data; loading = false; });
    } catch (e) {
      setState(() { schedule = null; loading = false; });
    }
  }

  String _formatDate(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  DateTime _getMonday(DateTime date) {
    return date.subtract(Duration(days: date.weekday - 1));
  }
}