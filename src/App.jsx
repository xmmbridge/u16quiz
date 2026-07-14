import { Routes, Route, Navigate } from 'react-router-dom';
import { getSessionUser } from './lib/session.js';
import Login from './pages/Login.jsx';
import StudentQuizList from './pages/StudentQuizList.jsx';
import QuizTaking from './pages/QuizTaking.jsx';
import Results from './pages/Results.jsx';
import MyChallenges from './pages/MyChallenges.jsx';
import MyQA from './pages/MyQA.jsx';
import TeacherDashboard from './pages/TeacherDashboard.jsx';
import ChallengeQueue from './pages/ChallengeQueue.jsx';
import TeacherQA from './pages/TeacherQA.jsx';
import MissedAnswers from './pages/MissedAnswers.jsx';

function RequireRole({ role, children }) {
  const user = getSessionUser();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/student" element={<RequireRole role="student"><StudentQuizList /></RequireRole>} />
      <Route path="/student/quiz/:quizId" element={<RequireRole role="student"><QuizTaking /></RequireRole>} />
      <Route path="/student/results/:quizId" element={<RequireRole role="student"><Results /></RequireRole>} />
      <Route path="/student/challenges" element={<RequireRole role="student"><MyChallenges /></RequireRole>} />
      <Route path="/student/qa" element={<RequireRole role="student"><MyQA /></RequireRole>} />

      <Route path="/teacher" element={<RequireRole role="teacher"><TeacherDashboard /></RequireRole>} />
      <Route path="/teacher/quiz/:quizId" element={<RequireRole role="teacher"><QuizTaking /></RequireRole>} />
      <Route path="/teacher/quiz/:quizId/missed" element={<RequireRole role="teacher"><MissedAnswers /></RequireRole>} />
      <Route path="/teacher/quiz/:quizId/missed/:studentId" element={<RequireRole role="teacher"><MissedAnswers /></RequireRole>} />
      <Route path="/teacher/challenges" element={<RequireRole role="teacher"><ChallengeQueue /></RequireRole>} />
      <Route path="/teacher/qa" element={<RequireRole role="teacher"><TeacherQA /></RequireRole>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
