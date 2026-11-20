// Isolated acceptance entry; never imported by the production app.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import ScheduleBoard from '../components/ScheduleBoard';
import {MobileSchedule} from '../components/MobileSchedule';
import * as cache from '../utils/scheduleCoursePageCache';
import {fetchPublicCourses} from '../utils/coursesApi';
import '../index.css';
Object.assign(window,{gateClient:{...cache,fetchPublicCourses}});
const mobile=new URLSearchParams(location.search).get('surface')==='mobile';
createRoot(document.getElementById('root')!).render(<BrowserRouter>{mobile?<MobileSchedule/>:<ScheduleBoard/>}</BrowserRouter>);
