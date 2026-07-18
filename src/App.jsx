import { BrowserRouter, Routes, Route } from "react-router-dom";

import Dashboard from "./page/Dashboard";
import Projects from "./page/Projects";
import CameraView from "./page/CameraView";

import TestModel from "./page/TestModel";

import Register from "./page/Register";

import CreateProject from "./page/CreateProject";
import NewProject from "./page/Newproject";
import Login from "./page/Login";

import DataCapture from "./page/DataCapture";
import DatasetGeneratorSetting from "./page/DatasetGeneratorSetting";
import Pricing  from "./page/Pricing";
import Checkout from "./page/Checkout";
import ContactSales from "./page/ContactSales";
import Single from "./page/Single";

import Burst from "./page/Burst";
import AIGenerator from "./page/AIGenerator";
import aftertraining from "./page/Aftertraining";
import DetectionCapture from "./page/DetectionCapture";
 
import SelectTraining from "./page/SelectTraining";
import DetSegTrain from "./page/Train_export";
function App() {
  return (
    <BrowserRouter>
      <Routes>

  <Route
    path="/login"
    element={<Login />}
  />

  <Route
    path="/register"
    element={<Register />}
  />

  <Route
    path="/"
    element={<Dashboard />}
  />

  <Route
    path="/projects"
    element={<Projects />}
  />

  <Route
    path="/camera"
    element={<CameraView />}
  />

  <Route
    path="/testmodel"
    element={<TestModel />}
  />

  <Route
    path="/create-project"
    element={<CreateProject />}
  />

  <Route
    path="/new-project"
    element={<NewProject />}
  />

  <Route
  path="/data-capture"
  element={<DataCapture />}
  />

  <Route
  path="/dataset-generator"
  element={<DatasetGeneratorSetting />}
/>


<Route
  path="/pricing"
  element={<Pricing />}
/>

<Route
  path="/checkout"
  element={<Checkout />}
/>

<Route
  path="/contact-sales"
  element={<ContactSales />}
/>

<Route
  path="/single"
  element={<Single />}
/>

<Route
  path="/burst"
  element={<Burst />}
/>

<Route
  path="/ai-generator"
  element={<AIGenerator />}
/>

<Route
  path="/Aftertraining"
  element={<aftertraining />}
/>

<Route path="/detection-capture" element={<DetectionCapture />} />

<Route path="/select-training" element={<SelectTraining />} />

<Route path="/det-seg-train" element={<Train_export />} />

</Routes>
    </BrowserRouter>
  );
}

export default App;