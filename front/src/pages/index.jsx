// import Layout from "./Layout.jsx";

// import Dashboard from "./Dashboard";

// import PatientDetail from "./PatientDetail";

// import VisualDemo from "./VisualDemo";

// import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

// const PAGES = {
    
//     Dashboard: Dashboard,
    
//     PatientDetail: PatientDetail,
    
//     VisualDemo: VisualDemo,
    
// }

// function _getCurrentPage(url) {
//     if (url.endsWith('/')) {
//         url = url.slice(0, -1);
//     }
//     let urlLastPart = url.split('/').pop();
//     if (urlLastPart.includes('?')) {
//         urlLastPart = urlLastPart.split('?')[0];
//     }

//     const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
//     return pageName || Object.keys(PAGES)[0];
// }

// // Create a wrapper component that uses useLocation inside the Router context
// function PagesContent() {
//     const location = useLocation();
//     const currentPage = _getCurrentPage(location.pathname);
    
//     return (
//         <Layout currentPageName={currentPage}>
//             <Routes>            
                
//                     <Route path="/" element={<Dashboard />} />
                
                
//                 <Route path="/Dashboard" element={<Dashboard />} />
                
//                 <Route path="/PatientDetail" element={<PatientDetail />} />
                
//                 <Route path="/VisualDemo" element={<VisualDemo />} />
                
//             </Routes>
//         </Layout>
//     );
// }

// export default function Pages() {
//     return (
//         <Router>
//             <PagesContent />
//         </Router>
//     );
// }
// src/pages/index.jsx
import Layout from "./Layout.jsx";
import Dashboard from "./Dashboard.jsx";
import PatientDetail from "./PatientDetail.jsx";
import VisualDemo from "./VisualDemo.jsx";
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from "react-router-dom";

const PAGES = {
  dashboard: "Dashboard",
  patientdetail: "PatientDetail",
  visualdemo: "VisualDemo",
};

// 현재 경로로 현재 페이지명 계산
function getCurrentPageName(pathname) {
  // 예: "/", "/dashboard", "/patientdetail?x=1" 등
  const clean = pathname.replace(/\/+$/, ""); // 끝 슬래시 제거
  const last = clean.split("/").pop() || "dashboard"; // "/"면 dashboard로
  return PAGES[last.toLowerCase()] || "Dashboard";
}

function PagesContent() {
  const location = useLocation();
  const currentPage = getCurrentPageName(location.pathname);

  return (
    <Layout currentPageName={currentPage}>
      <Routes>
        {/* 기본: 대시보드 */}
        <Route path="/" element={<Dashboard />} />
        {/* 소문자 경로로 통일 */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/patientdetail" element={<PatientDetail />} />
        <Route path="/visualdemo" element={<VisualDemo />} />
        {/* 그 외 모든 경로는 홈으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function Pages() {
  return (
    <Router>
      <PagesContent />
    </Router>
  );
}
