import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/*
 * Note: React.StrictMode is intentionally omitted. StrictMode double-invokes
 * effects in development, which would start the webcam stream and instantiate
 * the MediaPipe FaceLandmarker twice. Media + ML resources are awkward to make
 * fully idempotent under that double-mount, so we keep dev behaviour identical
 * to production for a reliable demo. Effects still clean up after themselves.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
