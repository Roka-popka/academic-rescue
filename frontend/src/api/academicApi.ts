export type StudentStatus = 'NORMAL' | 'WATCHLIST' | 'INTERVENTION_REQUIRED';
export type Direction = 'DECLINING' | 'STABLE' | 'IMPROVING';
export interface StudentSummary {
  id: string;
  name: string;
  course: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trajectory: { direction: Direction; slope: number; severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE' };
  projectedFinal: number | null;
  status: StudentStatus;
}
export interface StudentDetails extends StudentSummary {
  attendance: number;
  missedDeadlines: number;
  gradeHistory: number[];
  weakTopics: string[];
  upcomingDeadlines: { courseName: string; title: string; daysLeft: number }[];
  riskFactors: string[];
  followUp: { days: number; scheduledFor: string; simulated: boolean } | null;
  followUpDays: number | null;
  recommendation: string[];
  materials: { courseName: string; topic: string; title: string; content: string }[];
}
export interface ScreeningSummary {
  studentsScanned: number;
  normal: number;
  watchlist: number;
  interventionRequired: number;
  deepAnalyses: number;
  briefReviews: number;
}

const API_URL = 'http://localhost:3001/api';
async function request<T>(path: string, signal?: AbortSignal, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API_URL}${path}`, { ...options, signal }); }
  catch { throw new Error('Не удалось связаться с сервером Academic Rescue.'); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Не удалось выполнить запрос Academic Rescue.');
  }
  return response.json();
}

export const getStudents = (signal?: AbortSignal) => request<StudentSummary[]>('/students', signal);
export const getStudentById = (id: string, signal?: AbortSignal) => request<StudentDetails>(`/students/${encodeURIComponent(id)}`, signal);
export const getScreeningSummary = (signal?: AbortSignal) => request<ScreeningSummary>('/screening', signal);

export interface StudentActions {
  studentId: string;
  approvedPlans: { approvedAt: string; plan: { steps: string[] }; courseName: string }[];
  notifications: { kind?: 'WARNING' | 'INTERVENTION'; sentAt: string; message: string }[];
  warnings: { sentAt: string; message: string }[];
  followUps: { days: number; scheduledFor: string; completed: boolean; createdAt?: string }[];
}
export interface ActionResult { success: boolean; message: string; actions: StudentActions }
const postAction = (id: string, action: string, body = {}) => request<ActionResult>(`/students/${encodeURIComponent(id)}/${action}`, undefined,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const approvePlan = (id: string) => postAction(id, 'approve-plan');
export const sendIntervention = (id: string) => postAction(id, 'send-intervention');
export const sendWarning = (id: string) => postAction(id, 'send-warning');
export const scheduleFollowUp = (id: string, days: number) => postAction(id, 'follow-up', { days });
export const getStudentActions = (id: string, signal?: AbortSignal) => request<StudentActions>(`/students/${encodeURIComponent(id)}/actions`, signal);

export type StudentResponseType = 'PLAN_UNDERSTOOD' | 'NEED_TEACHER_HELP' | 'TASK_COMPLETED';
export interface StudentResponse {
  id: string;
  studentId: string;
  type: StudentResponseType;
  message: string;
  createdAt: string;
}
export const getStudentResponses = (id: string, signal?: AbortSignal) => request<StudentResponse[]>(`/students/${encodeURIComponent(id)}/responses`, signal);
export const sendStudentResponse = (id: string, type: StudentResponseType, message?: string) => request<StudentResponse>(`/students/${encodeURIComponent(id)}/responses`, undefined,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, message }) });
