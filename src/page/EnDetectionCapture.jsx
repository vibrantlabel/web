import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";



// 📖 Usage guide content for each annotation tool, grouped by tool
const ANNOTATION_GUIDE_SECTIONS = [
  {
    icon: "🟧",
    title: "Bounding Box",
    items: [
      "-Click and drag to draw a rectangle around the object you want to detect",
      "-Drag an edge or corner of an existing box to resize it",
      "-Click the label to edit the class name",
      "-Ctrl + drag the label: moves only the label position, not the box itself"
    ]
  },
  {
    icon: "⬡",
    title: "Polygon",
    items: [
      "-Click to add boundary points one by one, then click the first point again (or press the ✅ Close Shape button) to close the polygon",
      "-Drag an existing point to reposition it",
      "-Click on the edge of a closed polygon to insert a new point there",
      "-Drag inside the shape (not on a point/edge): moves the whole shape",
      "-Right-click on a point and drag, same as left-click",
      "-Hover over a point and press 'd': deletes just that one point",
      "-While drawing a Polygon: press r to undo the last point, Esc to cancel the whole shape"
    ]
  },
  {
    icon: "🔒",
    title: "Blur (hide private data)",
    items: [
      "-Click and drag a box over the area you want to blur (e.g. a person's face, license plate, document)",
      "-When you save, the actual image will be permanently blurred at the pixel level and cannot be recovered",
      "-Choose the Blur box color from the dropdown before drawing"
    ]
  },
  {
    icon: "🦴",
    title: "Pose / Keypoint",
    items: [
      "-Click to place points in the order the system indicates (nose → eyes → ears → shoulders → elbows → wrists → hips → knees → ankles)",
      "-The system automatically draws skeleton lines connecting the points; once all 17 points are placed the pose closes automatically",
      "-Or press the ✅ button to close before all points are placed",
      "-Drag an existing point to reposition it",
      "-Press r to undo the last point, Esc to cancel the pose being drawn"
    ]
  },
  {
    icon: "📍",
    title: "Landmark",
    items: [
      "-Choose a type (face/hand) first, then click to place points in the order the system indicates",
      "-The system automatically draws connecting lines based on the selected template",
      "-Once all points are placed the landmark closes automatically (or press the ✅ button to close early)",
      "-Drag an existing point to reposition it",
      "Press r to undo the last point, Esc to cancel the landmark being drawn"
    ]
  }
];

// ⌨️ General shortcuts, usable regardless of which mode is selected
const GENERAL_SHORTCUTS = [
  "-Ctrl+Z: undo the most recent step",
  "-Hover over a label, then Ctrl+C / Ctrl+V: copy/paste a box or polygon",
  "-Right-click on a box/Polygon/Blur/Pose/Landmark: delete it immediately",
  "-Ctrl + scroll wheel over the image: zoom in/out",
  "-Hold the middle mouse button and drag: pan the image (while zoomed)",
  "-Fullscreen button: view/edit the Canvas fullscreen (Esc to exit)"
];

export default function EnDetectionCapture() {
  const navigate = useNavigate();
  const location = useLocation();

const [planLimits, setPlanLimits] = useState(location.state?.planLimits || null);
const [planUsage, setPlanUsage] = useState(location.state?.planUsage || null);
const [loadingPlan, setLoadingPlan] = useState(!location.state?.planLimits);

  const videoRef = useRef(null);
  const imageContainerRef = useRef(null);

  const project = localStorage.getItem("project_name") || "My Project";

  const initialTotalImages = Number(localStorage.getItem("total_images")) || 0;
  const [totalImagesSaved, setTotalImagesSaved] = useState(initialTotalImages);

  // 🌟 V2: Choose the annotation drawing mode per object, no longer tied to project_type
  // "bbox" = Bounding Box, "polygon" = Polygon, "blur" = area to blur for privacy (V3)
  // "keypoint" = Pose Estimation (skeleton), "landmark" = Landmark Detection (key points, e.g. face/hand) (V8)
  // The same image can mix multiple types together (mixed annotation + privacy blur)
  const [annotationMode, setAnnotationMode] = useState("bbox");
  const isSegmentation = annotationMode === "polygon"; // keeping the old name to minimize changes to the rest of the code below
  const isBlurMode = annotationMode === "blur"; // 🔒 V3: blur area drawing mode
  const isKeypointMode = annotationMode === "keypoint"; // 🦴 V8: Pose Estimation mode
  const isLandmarkMode = annotationMode === "landmark"; // 📍 V8: Landmark Detection mode

  const pageTitle = "🎯 Object Detection & Segmentation";
  const canvasTitle = isSegmentation
    ? "⬡ Polygon Canvas"
    : isBlurMode
      ? "🔒 Blur Canvas"
      : isKeypointMode
        ? "🦴 Pose / Keypoint Canvas"
        : isLandmarkMode
          ? "📍 Landmark Canvas"
          : "🟧 Bounding Box Canvas";

  const [capturedImage, setCapturedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // ⚠️ Stores the error message when opening the PC camera fails (permission denied/no camera/camera in use by another app/not HTTPS, etc.)
  const [cameraErrorMessage, setCameraErrorMessage] = useState("");

  // ==========================================================
  // 📷 Camera Source: "browser" (PC Camera), "esp32" (ESP32-CAM), or "mobile" (scan QR)
  // ==========================================================
  const [cameraSource, setCameraSource] = useState("browser");

  // The value the user is currently typing into the IP field (not yet confirmed)
   const [esp32IpInput, setEsp32IpInput] = useState(
  localStorage.getItem("camera_url") || "192.168.43.181/stream"
);

  // The confirmed IP value (only after clicking "Connect") used to build the stream URL
  const [esp32IpConnected, setEsp32IpConnected] = useState(null);

  // ESP32 status: "idle" | "connecting" | "connected" | "error"
  const [esp32Status, setEsp32Status] = useState("idle");

  // Cache-buster for the browser when reconnecting to the stream (only changes when Connect is clicked, not on every render)
  const [esp32StreamKey, setEsp32StreamKey] = useState(0);

  const esp32ImgRef = useRef(null);

  // ==========================================================
  // 📱 Mobile Camera (scan QR Code): use the logged-in user's phone as the capture device,
  // sending images to this Canvas wirelessly (no cable needed / no need to be on the same LAN as ESP32)
  //
  // Flow: user clicks "Generate QR Code" -> creates a session tied to the logged-in user's email
  // -> shows a QR pointing to the mobile camera web page (route: /mobile-camera?session=...)
  // -> the phone scans it and opens its camera, sending frames to the server tied to the same session
  // -> this page polls for the latest frame of that session and shows it in the canvas below
  //
  // ⚠️ Requires matching backend endpoints (not included in this file):
  //   POST /create_mobile_camera_session  body: { email, project, session_id } -> { session_id }
  //   POST /get_mobile_camera_frame       body: { email, session_id } -> { connected, image_url }
  //   (image_url = a short-lived signed Cloud Storage URL generated by the backend, not raw base64)
  // And a mobile web page at route "/mobile-camera" which opens the phone's camera and uploads frames
  // to the same session periodically (also not created in this file)
  // ==========================================================
  const [mobileSessionId, setMobileSessionId] = useState(null);
  const [mobileQrUrl, setMobileQrUrl] = useState("");           // QR Code image (generated from a public QR API)
  const [mobileCaptureUrl, setMobileCaptureUrl] = useState(""); // The URL the QR points to (can be shown/copied to the user)
  const [mobileStatus, setMobileStatus] = useState("idle");     // "idle" | "waiting" | "connected" | "error"
  const mobileImgRef = useRef(null);
  const mobilePollIntervalRef = useRef(null);
  const MOBILE_POLL_INTERVAL_MS = 800; // how often to fetch the latest frame from the phone

  // ==========================================================
  // 🎯 Target image size (px) — the user enters a raw number, no preset/description
  // Used to resize the image down before every save (longest side, keeping the original aspect ratio)
  // This value is sent as imgsz when training (read from the same localStorage used on the
  // Train Model page) — the backend no longer calculates imgsz itself from the stored image size
  // ==========================================================
  const DEFAULT_TARGET_IMAGE_SIZE = 640;
  const MIN_TARGET_IMAGE_SIZE = 32;
  const MAX_TARGET_IMAGE_SIZE = 1280;

  // 🆕💾 Remember the value previously set per project (stored in localStorage the same way
  // as KNOWN_CLASSES_KEY below) — reopening the same project should immediately show the
  // last value set, without having to set it again every time this page is opened
  const RESOLUTION_TARGET_KEY = `resolution_target_${project}`;

  const loadSavedTargetImageSize = () => {
    try {
      const saved = Number(JSON.parse(localStorage.getItem(RESOLUTION_TARGET_KEY) || "null"));
      if (Number.isFinite(saved) && saved > 0) return Math.round(saved);
    } catch {
      // In case the saved value is corrupted/unparsable -> fall back to the default below
    }
    return DEFAULT_TARGET_IMAGE_SIZE;
  };

  const [targetImageSize, setTargetImageSize] = useState(() => loadSavedTargetImageSize());

  // Save to localStorage every time the user changes the number (always tied to the current project)
  useEffect(() => {
    try {
      localStorage.setItem(RESOLUTION_TARGET_KEY, JSON.stringify(targetImageSize));
    } catch (err) {
      console.error("Save resolution target failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetImageSize]);

  useEffect(() => {
  if (location.state?.planLimits) return; // already have state, no need to fetch again

  const serverUrl = localStorage.getItem("cloud_url");
  const email = localStorage.getItem("email");
  if (!serverUrl || !email) { setLoadingPlan(false); return; }

  let cancelled = false;
  (async () => {
    try {
      const cleanServerUrl = serverUrl.replace(/\/$/, "");
      const response = await fetch(`${cleanServerUrl}/get_user_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      if (!cancelled && result.success) {
        setPlanLimits(result.limits || null);
        setPlanUsage(result.usage || null);
      }
    } catch (err) {
      console.error("LOAD USER PLAN FAILED (DetectionCapture):", err);
    } finally {
      if (!cancelled) setLoadingPlan(false);
    }
  })();

  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  // The longest-side size currently used to resize the actual image (clamped to keep within bounds)
  const getActiveMaxDimension = () => {
    const n = Number(targetImageSize);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_TARGET_IMAGE_SIZE;
    return Math.max(MIN_TARGET_IMAGE_SIZE, Math.min(MAX_TARGET_IMAGE_SIZE, Math.round(n)));
  };

  // States for the Bounding Box system (Detection mode)
  const [boxes, setBoxes] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState(null);

  // 🎯 Resize / move system for already-drawn boxes (Detection mode)
  // editingHandle stores which edge/corner of which box is currently being dragged (null = not dragging)
  const [editingHandle, setEditingHandle] = useState(null); // { boxId, type, startPos, original }
  const [hoverCursor, setHoverCursor] = useState(null); // cursor to show while hovering an edge/corner (not dragging)
  const HANDLE_TOLERANCE = 8; // px distance considered "hovering on the line/corner"
  const MIN_BOX_SIZE = 5; // px minimum box size allowed when resizing

  // States for the Polygon system (Segmentation mode)
  const [polygons, setPolygons] = useState([]);
  const [currentPolygonPoints, setCurrentPolygonPoints] = useState([]);
  const [hoverPoint, setHoverPoint] = useState(null);
  const CLOSE_POLYGON_RADIUS = 12; // distance (px) close enough to the first point to count as closing the shape

  // ⚫ System for dragging a vertex of an already-drawn Polygon (Segmentation mode)
  const [draggingVertex, setDraggingVertex] = useState(null); // { polygonId, pointIndex }
  const VERTEX_HIT_RADIUS = 8; // px distance considered "hovering on the point"
  const suppressNextClickRef = useRef(false); // prevents the click after dragging a point from adding a new point on top of it


// 🆕 Tracks which vertex of which Polygon the mouse is currently hovering over
// Used together with the 'd' key to delete only that one point (not the whole shape)
const hoveredPolygonVertexRef = useRef(null); // { polygonId, pointIndex } | null

// 🆕 Prevents the contextmenu (right-click) from deleting the whole shape if it was just used to drag a point
const isRightDragRef = useRef(false);

  // 🏷️ Edit the label right where it was drawn (click the label on a box/polygon to edit immediately)
  const [editingBoxLabelId, setEditingBoxLabelId] = useState(null);
  const [editingPolygonLabelId, setEditingPolygonLabelId] = useState(null);

  // ==========================================================
  // 🔒 V3: Blur system for private areas (faces, license plates, documents, etc.)
  // Stored as { id, x, y, w, h, color } like a box, but without a label/class since it's not
  // an annotation for model training — just an area that will be "permanently blurred to actual pixels" before upload
  // ==========================================================
  const [blurRegions, setBlurRegions] = useState([]);
  const [isDrawingBlur, setIsDrawingBlur] = useState(false);
  const [blurStartPos, setBlurStartPos] = useState({ x: 0, y: 0 });
  const [currentBlurBox, setCurrentBlurBox] = useState(null);

  // ==========================================================
  // 🦴 V8: Keypoint Detection / Pose Estimation system
  // Stored as a whole pose { id, label, colorOverride, keypoints: [{x,y,name,visible}] }
  // The user clicks to place points one by one in template order (COCO 17 keypoints); the connecting
  // lines (skeleton) are computed from POSE_CONNECTIONS below — once all points are drawn the pose closes automatically
  // ==========================================================
  const POSE_TEMPLATE = {
    names: [
      "nose", "left_eye", "right_eye", "left_ear", "right_ear",
      "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
      "left_wrist", "right_wrist", "left_hip", "right_hip",
      "left_knee", "right_knee", "left_ankle", "right_ankle"
    ],
    // Index pairs of points that need connecting lines (following the COCO-17 skeleton standard)
    connections: [
      [0, 1], [0, 2], [1, 3], [2, 4],
      [0, 5], [0, 6], [5, 6],
      [5, 7], [7, 9], [6, 8], [8, 10],
      [5, 11], [6, 12], [11, 12],
      [11, 13], [13, 15], [12, 14], [14, 16]
    ]
  };
  const POSE_POINT_COLOR = "#F97316";
  const POSE_LINE_COLOR = "#0EA5E9";

  const [poses, setPoses] = useState([]);
  const [currentPoseKeypoints, setCurrentPoseKeypoints] = useState([]); // points already placed for the pose currently being drawn
  const [draggingPoseVertex, setDraggingPoseVertex] = useState(null); // { poseId, pointIndex }
  const [editingPoseLabelId, setEditingPoseLabelId] = useState(null);
  const POSE_VERTEX_HIT_RADIUS = 8;

  // ==========================================================
  // 📍 V8: Keypoint / Landmark Detection system (general, not limited to a human body)
  // A template (face / hand) can be selected, each with its own point count + connecting lines
  // ==========================================================
  const LANDMARK_TEMPLATES = {
    face: {
      label: "😊 Face (5 points)",
      names: ["left_eye", "right_eye", "nose_tip", "left_mouth", "right_mouth"],
      connections: [[0, 2], [1, 2], [2, 3], [2, 4], [3, 4]]
    },
    hand: {
      label: "✋ Hand (21 points)",
      names: [
        "wrist",
        "thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip",
        "index_mcp", "index_pip", "index_dip", "index_tip",
        "middle_mcp", "middle_pip", "middle_dip", "middle_tip",
        "ring_mcp", "ring_pip", "ring_dip", "ring_tip",
        "pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip"
      ],
      // MediaPipe Hand skeleton (21 keypoints)
      connections: [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20],
        [5, 9], [9, 13], [13, 17]
      ]
    }
  };
  const LANDMARK_POINT_COLOR = "#EC4899";
  const LANDMARK_LINE_COLOR = "#8B5CF6";

  const [landmarkTemplateChoice, setLandmarkTemplateChoice] = useState("face");
  const [landmarks, setLandmarks] = useState([]);
  const [currentLandmarkPoints, setCurrentLandmarkPoints] = useState([]);
  const [draggingLandmarkVertex, setDraggingLandmarkVertex] = useState(null); // { landmarkId, pointIndex }
  const [editingLandmarkLabelId, setEditingLandmarkLabelId] = useState(null);
  const LANDMARK_VERTEX_HIT_RADIUS = 8;

  // ==========================================================
  // 🎨 V5: List of selectable colors via dropdown (currently used for Blur only,
  // but intentionally designed as a separate constant so it can be easily extended to
  // Bounding Box / Polygon in the future without tying to the existing getColorForLabel)
  // Each option is prefixed with a colored-square emoji, to give a rough color hint in the
  // <select>, since browsers won't let a real background color be applied to an <option>
  // ==========================================================
  const COLOR_PICKER_OPTIONS = [
    { value: "#7C3AED", label: "🟣 Purple (default)" },
    { value: "#EF4444", label: "🔴 Red" },
    { value: "#F97316", label: "🟠 Orange" },
    { value: "#F59E0B", label: "🟡 Yellow" },
    { value: "#10B981", label: "🟢 Green" },
    { value: "#14B8A6", label: "🟢 Teal" },
    { value: "#0078D7", label: "🔵 Blue" },
    { value: "#6366F1", label: "🔵 Indigo" },
    { value: "#EC4899", label: "🌸 Pink" },
    { value: "#374151", label: "⚫ Dark Gray" },
  ];
  const DEFAULT_BLUR_COLOR = "#7C3AED";

  // 🆕💾 Remember the previously chosen Blur color per project (same pattern as RESOLUTION_TARGET_KEY below)
  const BLUR_COLOR_KEY = `blur_color_${project}`;

  const loadSavedBlurColor = () => {
    try {
      const saved = localStorage.getItem(BLUR_COLOR_KEY);
      if (saved && COLOR_PICKER_OPTIONS.some(c => c.value === saved)) return saved;
    } catch {
      // In case the saved value is corrupted -> fall back to the default below
    }
    return DEFAULT_BLUR_COLOR;
  };

  // Color to use for the "next" blur region drawn (existing ones don't change color to match)
  const [blurColor, setBlurColor] = useState(() => loadSavedBlurColor());

  useEffect(() => {
    try {
      localStorage.setItem(BLUR_COLOR_KEY, blurColor);
    } catch (err) {
      console.error("Save blur color failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blurColor]);

  // Convert hex color -> "r, g, b" string, used for the translucent background of the Blur box based on the selected color
  const hexToRgbStringForBlur = (hex) => {
    const clean = (hex || DEFAULT_BLUR_COLOR).replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  };

  // ==========================================================
  // 🎨 V6: color-selection dropdown for Bounding Box and Polygon, same as Blur
  // Unlike Blur, boxes/polygons already have an automatic color-by-label system
  // (getColorForLabel), so this dropdown always has a special "Automatic" option as the
  // default — if the user picks a specific color, that color is remembered for "that shape"
  // once drawing finishes (stored in box.colorOverride / poly.colorOverride) and is not tied
  // to the label — older shapes drawn before don't change color when the dropdown is switched later
  // ==========================================================
  const AUTO_COLOR_VALUE = "auto";
  const SHAPE_COLOR_OPTIONS = [
    { value: AUTO_COLOR_VALUE, label: "🎨 Automatic (based on label name)" },
    ...COLOR_PICKER_OPTIONS
  ];

  const BOX_COLOR_KEY = `box_color_${project}`;
  const POLYGON_COLOR_KEY = `polygon_color_${project}`;
  const POSE_COLOR_KEY = `pose_color_${project}`;
  const LANDMARK_COLOR_KEY = `landmark_color_${project}`;

  const loadSavedShapeColor = (key) => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === AUTO_COLOR_VALUE || COLOR_PICKER_OPTIONS.some(c => c.value === saved)) return saved;
    } catch {
      // In case the saved value is corrupted -> fall back to the default below
    }
    return AUTO_COLOR_VALUE;
  };

  // Color to use for the "next" Bounding Box / Polygon / Pose / Landmark drawn — defaults to "auto" (uses the color based on the label)
  const [boxColorChoice, setBoxColorChoice] = useState(() => loadSavedShapeColor(BOX_COLOR_KEY));
  const [polygonColorChoice, setPolygonColorChoice] = useState(() => loadSavedShapeColor(POLYGON_COLOR_KEY));
  const [poseColorChoice, setPoseColorChoice] = useState(() => loadSavedShapeColor(POSE_COLOR_KEY));
  const [landmarkColorChoice, setLandmarkColorChoice] = useState(() => loadSavedShapeColor(LANDMARK_COLOR_KEY));

  useEffect(() => {
    try {
      localStorage.setItem(BOX_COLOR_KEY, boxColorChoice);
    } catch (err) {
      console.error("Save box color failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxColorChoice]);

  useEffect(() => {
    try {
      localStorage.setItem(POLYGON_COLOR_KEY, polygonColorChoice);
    } catch (err) {
      console.error("Save polygon color failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygonColorChoice]);

  useEffect(() => {
    try {
      localStorage.setItem(POSE_COLOR_KEY, poseColorChoice);
    } catch (err) {
      console.error("Save pose color failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseColorChoice]);

  useEffect(() => {
    try {
      localStorage.setItem(LANDMARK_COLOR_KEY, landmarkColorChoice);
    } catch (err) {
      console.error("Save landmark color failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarkColorChoice]);

  // 🔍 Canvas zoom system with Ctrl + scroll (helps draw/edit Bounding Box and Polygon in more detail)
  const [zoomLevel, setZoomLevel] = useState(1);
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;

  // ✋ Pan system by holding the middle mouse button and dragging — used while zoomed in to see detail
  // (deliberately uses the middle button instead of left, so it doesn't conflict with drawing
  // boxes/polygon points which already use the left button)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, offsetX: 0, offsetY: 0 });

  // Augmentation mode sent to the backend for processing
  const [augMode, setAugMode] = useState("original");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🆕📋 Copy/Paste with Ctrl+C / Ctrl+V while the mouse is over a box/polygon label
  const hoveredLabelRef = useRef(null); // { type: "box" | "polygon", id }
  const clipboardRef = useRef(null); // { type: "box" | "polygon", data }

  // 🆕✋ Ctrl+drag on the label -> moves only the label position (doesn't affect the box/shape at all)
  // Stored as an offset (dx, dy) from each label's default position
  const [draggingBoxLabel, setDraggingBoxLabel] = useState(null); // { boxId, startPos, originalOffset }
  const [draggingPolygonLabelState, setDraggingPolygonLabelState] = useState(null); // { polygonId, startPos, originalOffset }

  // Prevents onClick from re-entering rename mode right after finishing a label drag
  const suppressLabelClickRef = useRef(false);

  // 🆕⬡ Distance (px) close enough to a polygon edge to count as "insert a new point here"
  const EDGE_INSERT_TOLERANCE = 8;

  // 🆕✋ Drag an entire Polygon at once (click-and-hold inside the shape's area, not on a point, not on an edge)
  const [draggingPolygonMove, setDraggingPolygonMove] = useState(null); // { polygonId, startPos, originalPoints }

  // 🆕📐 The actual size (naturalWidth/naturalHeight) of the captured/uploaded image
  // Need to know this to calculate "where the actual image is displayed within the container"
  // (since objectFit: contain is used, which often leaves empty margins/letterboxing around the
  // image when the container's aspect ratio doesn't match the image's) — used to fix a bug in
  // rescaling box/polygon coordinates for greater accuracy when toggling fullscreen/back
  const [imgNaturalSize, setImgNaturalSize] = useState({ width: 0, height: 0 });

  // 🆕🖥️ Fullscreen Canvas system (helps draw/edit Bounding Box and Polygon more precisely on small screens)
  // Uses CSS-based fullscreen (fixed covering the whole screen) instead of the browser's
  // Fullscreen API, because it works more reliably whether running in an iframe/webview or a normal browser
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);

  // 🆕 popup: usage guide for each annotation tool
const [showAnnotationGuide, setShowAnnotationGuide] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 800
  );

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Canvas height: normally a fixed 380px; expands to fill the actual screen height when fullscreen (leaving room for buttons/toolbars above and below)
  const CANVAS_HEIGHT = isCanvasFullscreen ? Math.max(400, viewportHeight - 260) : 380;

  // Toggle Fullscreen: locks scrolling on the page behind it while fullscreen is open, to prevent scroll glitches
  useEffect(() => {
    if (isCanvasFullscreen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prevOverflow; };
    }
  }, [isCanvasFullscreen]);

  function normalizeCameraUrl(raw) {
  let url = raw.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url;
}

  // ==========================================================
  // 🖼️📐 Resize the image down to maxDimension (longest side), keeping the original aspect ratio
  // Used both when capturing a live snapshot (captureSnapshot) and when uploading an external file
  // (files from phones/cameras are often much larger than the target, e.g. 4000x3000)
  //
  // Works by drawing the original image directly to canvas at the new size, then extracting a
  // toDataURL. Never resized after the user has already drawn annotations, because the stored
  // box/polygon coordinates reference the container's display area (calculated from the
  // naturalWidth/naturalHeight the backend actually decodes) — always resizing before drawing
  // annotations means the img_w/img_h the backend sees exactly matches what the user actually
  // drew, with no need for extra rescale calculations on either the frontend or backend
  // ==========================================================
  const resizeImageSource = (source, naturalW, naturalH, maxDimension) => {
    let targetW = naturalW;
    let targetH = naturalH;

    if (naturalW > maxDimension || naturalH > maxDimension) {
      if (naturalW >= naturalH) {
        targetW = maxDimension;
        targetH = Math.round((naturalH / naturalW) * maxDimension);
      } else {
        targetH = maxDimension;
        targetW = Math.round((naturalW / naturalH) * maxDimension);
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, targetW, targetH);

    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      width: targetW,
      height: targetH
    };
  };

  // 🆕✅ Now, clicking save once -> the server automatically generates all 12 variants for you
  // (no more need to check mode-by-mode like before, since "save one mode at a time" no longer exists)
  const [allModesSaved, setAllModesSaved] = useState(false);

  // 🆕🖼️ Gallery of images actually saved in this project (fetched from /list_project_images_v2)
  // replaces the old Augmentation preview panel, since all 12 variants are now saved at once,
  // there's no longer a need to select a mode before saving
  const [projectGallery, setProjectGallery] = useState([]);
  const [loadingGallery, setLoadingGallery] = useState(false);

  // 🆕🏷️ List of class names previously set in this project (persisted in localStorage per project)
  // Used for autocomplete when naming Bounding Box / Polygon labels, to prevent inconsistent
  // naming (e.g. typing "yellow_cap" in one image, then mistyping "yelow_cap" in another)
  const KNOWN_CLASSES_KEY = `known_classes_${project}`;
  const [knownClasses, setKnownClasses] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KNOWN_CLASSES_KEY) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });

  // Register a new class name into the list (if not already present) every time the user confirms setting/editing a label
  const registerClassName = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setKnownClasses(prev => {
      if (prev.includes(trimmed)) return prev;
      const updated = [...prev, trimmed].sort((a, b) => a.localeCompare(b, "th"));
      try {
        localStorage.setItem(KNOWN_CLASSES_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error("Save known classes failed:", err);
      }
      return updated;
    });
  };

  // 🆕 Input field to pre-add class names in the "Input Source" card (left side)
  // Names added here will appear as autocomplete suggestions anywhere a Bounding Box or Polygon label is set/edited
  const [newClassInput, setNewClassInput] = useState("");

  const addKnownClassFromInput = () => {
    registerClassName(newClassInput);
    setNewClassInput("");
  };

  // Remove a class name from the suggested list (e.g. accidentally mistyped it when adding)
  const removeKnownClass = (name) => {
    setKnownClasses(prev => {
      const updated = prev.filter(c => c !== name);
      try {
        localStorage.setItem(KNOWN_CLASSES_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error("Save known classes failed:", err);
      }
      return updated;
    });
  };

  // ==========================================================
  // 🆕🔄 Re-sync per-project values (target usage + class list) every time
  // "project" actually changes (not just on the initial mount)
  // ==========================================================
  const prevProjectRef = useRef(project);

  useEffect(() => {
    if (prevProjectRef.current === project) return; // same project, no need to reload
    prevProjectRef.current = project;

    const savedSize = loadSavedTargetImageSize();
    setTargetImageSize(savedSize);

    try {
      const savedClasses = JSON.parse(localStorage.getItem(KNOWN_CLASSES_KEY) || "[]");
      setKnownClasses(Array.isArray(savedClasses) ? savedClasses : []);
    } catch {
      setKnownClasses([]);
    }

    // 🆕 When switching projects, also clear the old project's image/annotations
    setCapturedImage(null);
    resetAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // 🆕📶 Properly close the ESP32-CAM stream connection when leaving this page
  useEffect(() => {
    return () => {
      if (esp32ImgRef.current) {
        esp32ImgRef.current.src = "";
      }
    };
  }, []);

  // 📱 Properly stop the mobile camera polling when leaving this page
  useEffect(() => {
    return () => stopMobilePolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🛠️ Camera open/close mechanism (PC Camera / browser only)
  useEffect(() => {
    if (isCameraActive && cameraSource === "browser") {
      setCameraErrorMessage("");

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraErrorMessage("This browser doesn't support opening a camera. Please use the latest Chrome/Edge/Firefox.");
        setIsCameraActive(false);
        return;
      }

      if (location.protocol !== "https:" && location.hostname !== "localhost") {
        setCameraErrorMessage(`Must be opened via HTTPS or localhost only (currently opened via "${location.protocol}//${location.hostname}", which the browser won't allow camera access on)`);
        setIsCameraActive(false);
        return;
      }

      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then((stream) => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch((err) => {
          console.error("Error webcam: ", err);
          let msg = `Couldn't open the camera (${err.name || "unknown"}: ${err.message || ""})`;

          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            msg = "You denied camera permission. Please click the lock/camera icon next to the URL bar, switch it to Allow, and try again.";
          } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            msg = "No camera found on this device. Please check that a camera is connected.";
          } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            msg = "The camera is currently being used by another app (e.g. Zoom, Teams, another tab). Please close that app and try again.";
          } else if (err.name === "OverconstrainedError") {
            msg = "The camera doesn't support the requested resolution (640x480)";
          } else if (err.name === "SecurityError") {
            msg = "Blocked for security reasons (must be HTTPS or localhost)";
          }

          setCameraErrorMessage(msg);
          setIsCameraActive(false);
        });
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isCameraActive, cameraSource]);

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  // Close every camera/stream, regardless of source (used after finishing a capture, or when switching/uploading a file instead)
  const stopAnyCamera = () => {
    stopCamera();

    if (esp32ImgRef.current) {
      esp32ImgRef.current.src = "";
    }

    // 📱 Also close the mobile camera session/polling every time the camera is switched/stopped
    stopMobilePolling();
    setMobileSessionId(null);
    setMobileQrUrl("");
    setMobileCaptureUrl("");
    setMobileStatus("idle");

    setIsCameraActive(false);
    setEsp32Status("idle");
    setEsp32IpConnected(null);
  };

  // Switch Camera Source: always close the previous source's camera/stream first, to avoid it hanging
  const handleSelectCameraSource = (source) => {
    if (source === cameraSource) return;
    stopAnyCamera();
    setCameraSource(source);
  };

  // ==========================================================
  // 📶 ESP32-CAM: click "Connect" to confirm the IP and actually start the stream
  // ==========================================================
  const handleConnectEsp32 = () => {
  const normalized = normalizeCameraUrl(esp32IpInput);

  if (!normalized) {
    setEsp32Status("error");
    return;
  }

  localStorage.setItem("camera_url", esp32IpInput.trim());

  setEsp32Status("connecting");
  setEsp32IpConnected(normalized);
  setEsp32StreamKey(Date.now());
};

  // ==========================================================
  // 📱 Mobile Camera: create a new session tied to the logged-in user + QR Code for the phone to scan
  // ==========================================================
  const generateMobileSessionId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  };

  const stopMobilePolling = () => {
    if (mobilePollIntervalRef.current) {
      clearInterval(mobilePollIntervalRef.current);
      mobilePollIntervalRef.current = null;
    }
  };

// Fetch the latest frame sent in by the phone (continuous polling every MOBILE_POLL_INTERVAL_MS)
const pollMobileFrame = async (serverUrl, email, sessionId) => {
  try {
    const cleanServerUrl = serverUrl.replace(/\/$/, "");
    const response = await fetch(`${cleanServerUrl}/get_mobile_camera_frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, session_id: sessionId })
    });
    const result = await response.json();

    if (result.connected && result.image_url) {
      if (mobileImgRef.current) mobileImgRef.current.src = result.image_url;
      setMobileStatus("connected");

      // 🆕 If the backend says this frame is an image the user pressed "capture" on the phone for
      // (not just a continuous preview), automatically pull that image into the canvas
      if (result.captured) {
        await captureMobilePhotoFromUrl(result.image_url);
      }
    } else {
      // No frame has come in yet (phone hasn't opened its camera / hasn't finished scanning) -> keep waiting, not treated as an error
      setMobileStatus(prev => (prev === "connected" ? "waiting" : prev));
    }
  } catch (err) {
    console.error("Mobile frame poll failed:", err);
    setMobileStatus("error");
  }
};

// 🆕 Pull the photo the phone confirmed as "captured" into capturedImage on the canvas
// (works the same way as the existing captureSnapshot, just with a URL as the source instead of a live element)
const captureMobilePhotoFromUrl = async (imageUrl) => {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });

    const maxDimension = getActiveMaxDimension();
    const { dataUrl } = resizeImageSource(img, img.naturalWidth, img.naturalHeight, maxDimension);

    setCapturedImage(dataUrl);
    resetAnnotations();
    
  } catch (err) {
    console.error("Capture from mobile photo failed:", err);
  }
};

  // Click "Generate QR Code" -> request a new session from the server (tied to the logged-in user's email) then start polling for the image
  const handleGenerateMobileQr = async () => {
    const serverUrl = localStorage.getItem("cloud_url");
    const email = localStorage.getItem("email");

    if (!serverUrl || !email) {
      alert("Please check your Cloud URL settings and make sure you're logged in.");
      return;
    }

    stopMobilePolling();
    setMobileStatus("waiting");

    const cleanServerUrl = serverUrl.replace(/\/$/, "");


    let sessionId = generateMobileSessionId();

    try {
      const response = await fetch(`${cleanServerUrl}/create_mobile_camera_session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project, session_id: sessionId })
      });
      const result = await response.json();
      if (result && result.session_id) sessionId = result.session_id;
    } catch (err) {
      console.error("Create mobile session failed:", err);
      // In case the server doesn't have this endpoint ready yet -> keep using the client-generated sessionId, don't block the user
    }

    // 🔗 The URL the QR points to — tied to the logged-in user's email + current project + this specific session
    // ⚠️ Must include "server" (cloud_url) too, since the phone is a different device with no
    // access to this machine's localStorage. Without it, the mobile camera page wouldn't know where to upload frames to.
    const captureUrl = `${window.location.origin}/mobile-camera?session=${sessionId}&email=${encodeURIComponent(email)}&project=${encodeURIComponent(project)}&server=${encodeURIComponent(serverUrl)}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(captureUrl)}`;

    setMobileSessionId(sessionId);
    setMobileCaptureUrl(captureUrl);
    setMobileQrUrl(qrImageUrl);

    mobilePollIntervalRef.current = setInterval(() => {
      pollMobileFrame(serverUrl, email, sessionId);
    }, MOBILE_POLL_INTERVAL_MS);
  };

  // ⏪ Undo system (Ctrl+Z) - stores a snapshot of boxes/polygons/blurRegions/poses/landmarks before any action that changes the data
  const historyRef = useRef([]);
  const MAX_HISTORY = 50;

  const pushHistory = () => {
    historyRef.current.push({
      boxes: boxes.map(b => ({ ...b })),
      polygons: polygons.map(p => ({ ...p, points: p.points.map(pt => ({ ...pt })) })),
      blurRegions: blurRegions.map(r => ({ ...r })), // 🔒 V3
      poses: poses.map(p => ({ ...p, keypoints: p.keypoints.map(pt => ({ ...pt })) })), // 🦴 V8
      landmarks: landmarks.map(l => ({ ...l, points: l.points.map(pt => ({ ...pt })) })) // 📍 V8
    });
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
  };

  const undo = () => {
    const last = historyRef.current.pop();
    if (!last) return;
    setBoxes(last.boxes);
    setPolygons(last.polygons);
    setBlurRegions(last.blurRegions || []); // 🔒 V3
    setPoses(last.poses || []); // 🦴 V8
    setLandmarks(last.landmarks || []); // 📍 V8
  };

  // Clear all annotations (box/polygon/blur/pose/landmark) for the current image when starting a new one
  const resetAnnotations = () => {
    setBoxes([]);
    setPolygons([]);
    setCurrentPolygonPoints([]);
    setHoverPoint(null);
    setAllModesSaved(false);
    setAugMode("original");
    setEditingHandle(null);
    setHoverCursor(null);
    setEditingBoxLabelId(null);
    setEditingPolygonLabelId(null);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
    setDraggingVertex(null);
    setDraggingPolygonMove(null);
    setImgNaturalSize({ width: 0, height: 0 });
    setBlurRegions([]); // 🔒 V3
    setIsDrawingBlur(false); // 🔒 V3
    setCurrentBlurBox(null); // 🔒 V3
    setPoses([]); // 🦴 V8
    setCurrentPoseKeypoints([]); // 🦴 V8
    setDraggingPoseVertex(null); // 🦴 V8
    setEditingPoseLabelId(null); // 🦴 V8
    setLandmarks([]); // 📍 V8
    setCurrentLandmarkPoints([]); // 📍 V8
    setDraggingLandmarkVertex(null); // 📍 V8
    setEditingLandmarkLabelId(null); // 📍 V8
    historyRef.current = [];
  };

  // 🆕🖼️ Fetch the gallery of images actually saved in this project from the server
  const fetchProjectGallery = async () => {
    const serverUrl = localStorage.getItem("cloud_url");
    const email = localStorage.getItem("email");
    if (!serverUrl || !email) return;

    setLoadingGallery(true);

    try {
      const cleanServerUrl = serverUrl.replace(/\/$/, "");
      const response = await fetch(`${cleanServerUrl}/list_project_images_v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project, limit: 30 })
      });

      const result = await response.json();

      if (result.success) {
        setProjectGallery(result.images || []);
      }
    } catch (err) {
      console.error("Fetch gallery failed:", err);
    } finally {
      setLoadingGallery(false);
    }
  };

  // Load the gallery once when the page first opens
  useEffect(() => {
    fetchProjectGallery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 📸 Capture an image from the current source (video for PC Camera, img stream for ESP32-CAM, or img for mobile camera)
  const captureSnapshot = () => {
    let sourceEl, naturalW, naturalH;

    if (cameraSource === "browser") {
      if (!videoRef.current || videoRef.current.videoWidth === 0) return;
      sourceEl = videoRef.current;
      naturalW = videoRef.current.videoWidth;
      naturalH = videoRef.current.videoHeight;
    } else if (cameraSource === "mobile") {
      const img = mobileImgRef.current;
      if (!img || !img.complete || img.naturalWidth === 0) return;
      sourceEl = img;
      naturalW = img.naturalWidth;
      naturalH = img.naturalHeight;
    } else {
      const img = esp32ImgRef.current;
      if (!img || !img.complete || img.naturalWidth === 0) return;
      sourceEl = img;
      naturalW = img.naturalWidth;
      naturalH = img.naturalHeight;
    }

    const maxDimension = getActiveMaxDimension();
    const { dataUrl } = resizeImageSource(sourceEl, naturalW, naturalH, maxDimension);

    setCapturedImage(dataUrl);
    resetAnnotations();
    stopAnyCamera();
  };

  // 📂 Upload an image from an external file — resized according to the set targetImageSize as well
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDimension = getActiveMaxDimension();
        const { dataUrl } = resizeImageSource(img, img.naturalWidth, img.naturalHeight, maxDimension);
        setCapturedImage(dataUrl);
        resetAnnotations();
        stopAnyCamera();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 🎯 Function to calculate the mouse position within the container
  const getMousePos = (e) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };
    const rect = imageContainerRef.current.getBoundingClientRect();

    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    x -= panOffset.x;
    y -= panOffset.y;

    if (zoomLevel !== 1) {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      x = cx + (x - cx) / zoomLevel;
      y = cy + (y - cy) / zoomLevel;
    }

    x = Math.max(0, Math.min(x, rect.width));
    y = Math.max(0, Math.min(y, rect.height));

    return { x, y };
  };

  // 🆕📐 Calculate exactly where the actual image (objectFit: contain) is displayed within the container
  // (reused for mapping Blur region coordinates -> actual image pixels when saving too)
  const getImageDisplayRect = (containerWidth, containerHeight, naturalWidth, naturalHeight) => {
    if (!naturalWidth || !naturalHeight || !containerWidth || !containerHeight) {
      return { offsetX: 0, offsetY: 0, width: containerWidth, height: containerHeight };
    }
    const containerRatio = containerWidth / containerHeight;
    const imageRatio = naturalWidth / naturalHeight;
    let renderWidth, renderHeight;
    if (imageRatio > containerRatio) {
      renderWidth = containerWidth;
      renderHeight = containerWidth / imageRatio;
    } else {
      renderHeight = containerHeight;
      renderWidth = containerHeight * imageRatio;
    }
    return {
      offsetX: (containerWidth - renderWidth) / 2,
      offsetY: (containerHeight - renderHeight) / 2,
      width: renderWidth,
      height: renderHeight
    };
  };

  const getPanBounds = (zoomOverride) => {
    const rect = imageContainerRef.current?.getBoundingClientRect();
    const z = zoomOverride ?? zoomLevel;
    if (!rect) return { maxX: 0, maxY: 0 };
    return {
      maxX: Math.max(0, ((z - 1) * rect.width) / 2),
      maxY: Math.max(0, ((z - 1) * rect.height) / 2)
    };
  };

  const clampPanOffset = (offset, zoomOverride) => {
    const { maxX, maxY } = getPanBounds(zoomOverride);
    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y))
    };
  };

  // ==========================================================
  // 🟧 Bounding Box (Detection mode)
  // ==========================================================
  const getBoxHandleAt = (pos, box) => {
    const nearLeft = Math.abs(pos.x - box.x) <= HANDLE_TOLERANCE;
    const nearRight = Math.abs(pos.x - (box.x + box.w)) <= HANDLE_TOLERANCE;
    const nearTop = Math.abs(pos.y - box.y) <= HANDLE_TOLERANCE;
    const nearBottom = Math.abs(pos.y - (box.y + box.h)) <= HANDLE_TOLERANCE;

    const insideXPad = pos.x >= box.x - HANDLE_TOLERANCE && pos.x <= box.x + box.w + HANDLE_TOLERANCE;
    const insideYPad = pos.y >= box.y - HANDLE_TOLERANCE && pos.y <= box.y + box.h + HANDLE_TOLERANCE;
    if (!insideXPad || !insideYPad) return null;

    const isCorner = (nearLeft || nearRight) && (nearTop || nearBottom);
    if (isCorner) return "corner";

    if (nearTop) return "edge-top";
    if (nearBottom) return "edge-bottom";
    if (nearLeft) return "edge-left";
    if (nearRight) return "edge-right";
    return null;
  };

  const findHandleAtPos = (pos) => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const type = getBoxHandleAt(pos, boxes[i]);
      if (type) return { boxId: boxes[i].id, type };
    }
    return null;
  };

  const getCursorForHandleType = (type) => {
    switch (type) {
      case "edge-top":
      case "edge-bottom":
        return "ns-resize";
      case "edge-left":
      case "edge-right":
        return "ew-resize";
      case "corner":
        return "move";
      default:
        return null;
    }
  };

  const findPolygonVertexAt = (pos) => {
    for (let pi = polygons.length - 1; pi >= 0; pi--) {
      const poly = polygons[pi];
      for (let vi = poly.points.length - 1; vi >= 0; vi--) {
        const p = poly.points[vi];
        if (Math.hypot(pos.x - p.x, pos.y - p.y) <= VERTEX_HIT_RADIUS) {
          return { polygonId: poly.id, pointIndex: vi };
        }
      }
    }
    return null;
  };

  const distanceToSegment = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
  };

  const findPolygonEdgeInsertion = (pos) => {
    for (let pi = polygons.length - 1; pi >= 0; pi--) {
      const poly = polygons[pi];
      const pts = poly.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (distanceToSegment(pos, a, b) <= EDGE_INSERT_TOLERANCE) {
          return { polygonId: poly.id, insertIndex: i + 1 };
        }
      }
    }
    return null;
  };

  const insertPolygonPoint = (polygonId, insertIndex, pos) => {
    pushHistory();
    setPolygons(prev => prev.map(poly => {
      if (poly.id !== polygonId) return poly;
      const newPoints = [...poly.points];
      newPoints.splice(insertIndex, 0, { x: pos.x, y: pos.y });
      return { ...poly, points: newPoints };
    }));
  };

  // ==========================================================
  // 🦴 V8: find an already-drawn pose keypoint at the mouse position (for dragging)
  // ==========================================================
  const findPoseVertexAt = (pos) => {
    for (let pi = poses.length - 1; pi >= 0; pi--) {
      const pose = poses[pi];
      for (let vi = pose.keypoints.length - 1; vi >= 0; vi--) {
        const p = pose.keypoints[vi];
        if (Math.hypot(pos.x - p.x, pos.y - p.y) <= POSE_VERTEX_HIT_RADIUS) {
          return { poseId: pose.id, pointIndex: vi };
        }
      }
    }
    return null;
  };

  // 📍 V8: find an already-drawn landmark point at the mouse position (for dragging)
  const findLandmarkVertexAt = (pos) => {
    for (let li = landmarks.length - 1; li >= 0; li--) {
      const lm = landmarks[li];
      for (let vi = lm.points.length - 1; vi >= 0; vi--) {
        const p = lm.points[vi];
        if (Math.hypot(pos.x - p.x, pos.y - p.y) <= LANDMARK_VERTEX_HIT_RADIUS) {
          return { landmarkId: lm.id, pointIndex: vi };
        }
      }
    }
    return null;
  };

  // 🦴 V8: add the next keypoint in POSE_TEMPLATE order — once all points are placed the pose closes automatically
  const addPoseKeypointAt = (pos) => {
    const nextIndex = currentPoseKeypoints.length;
    const name = POSE_TEMPLATE.names[nextIndex];
    const updated = [...currentPoseKeypoints, { x: pos.x, y: pos.y, name, visible: true }];

    if (updated.length >= POSE_TEMPLATE.names.length) {
      pushHistory();
      setPoses(prev => [...prev, {
        id: Date.now(),
        label: "person",
        keypoints: updated,
        colorOverride: poseColorChoice !== AUTO_COLOR_VALUE ? poseColorChoice : undefined
      }]);
      setCurrentPoseKeypoints([]);
    } else {
      setCurrentPoseKeypoints(updated);
    }
  };

  const finishPoseNow = () => {
    if (currentPoseKeypoints.length === 0) return;
    pushHistory();
    setPoses(prev => [...prev, {
      id: Date.now(),
      label: "person",
      keypoints: currentPoseKeypoints,
      colorOverride: poseColorChoice !== AUTO_COLOR_VALUE ? poseColorChoice : undefined
    }]);
    setCurrentPoseKeypoints([]);
  };

  const undoLastPoseKeypoint = () => {
    setCurrentPoseKeypoints(prev => prev.slice(0, -1));
  };

  const cancelCurrentPose = () => {
    setCurrentPoseKeypoints([]);
  };

  const deletePose = (id) => {
    pushHistory();
    setPoses(prev => prev.filter(p => p.id !== id));
    if (editingPoseLabelId === id) setEditingPoseLabelId(null);
  };

  const handlePoseLabelChange = (id, newName) => {
    setPoses(prev => prev.map(p => p.id === id ? { ...p, label: newName } : p));
  };

  // 📍 V8: add the next landmark point in the order of the currently selected template — once all points are placed the landmark set closes automatically
  const addLandmarkPointAt = (pos) => {
    const template = LANDMARK_TEMPLATES[landmarkTemplateChoice];
    const nextIndex = currentLandmarkPoints.length;
    const name = template.names[nextIndex];
    const updated = [...currentLandmarkPoints, { x: pos.x, y: pos.y, name }];

    if (updated.length >= template.names.length) {
      pushHistory();
      setLandmarks(prev => [...prev, {
        id: Date.now(),
        label: landmarkTemplateChoice === "hand" ? "hand" : "face",
        templateType: landmarkTemplateChoice,
        points: updated,
        colorOverride: landmarkColorChoice !== AUTO_COLOR_VALUE ? landmarkColorChoice : undefined
      }]);
      setCurrentLandmarkPoints([]);
    } else {
      setCurrentLandmarkPoints(updated);
    }
  };

  const finishLandmarkNow = () => {
    if (currentLandmarkPoints.length === 0) return;
    pushHistory();
    setLandmarks(prev => [...prev, {
      id: Date.now(),
      label: landmarkTemplateChoice === "hand" ? "hand" : "face",
      templateType: landmarkTemplateChoice,
      points: currentLandmarkPoints,
      colorOverride: landmarkColorChoice !== AUTO_COLOR_VALUE ? landmarkColorChoice : undefined
    }]);
    setCurrentLandmarkPoints([]);
  };

  const undoLastLandmarkPoint = () => {
    setCurrentLandmarkPoints(prev => prev.slice(0, -1));
  };

  const cancelCurrentLandmark = () => {
    setCurrentLandmarkPoints([]);
  };

  const deleteLandmark = (id) => {
    pushHistory();
    setLandmarks(prev => prev.filter(l => l.id !== id));
    if (editingLandmarkLabelId === id) setEditingLandmarkLabelId(null);
  };

  const handleLandmarkLabelChange = (id, newName) => {
    setLandmarks(prev => prev.map(l => l.id === id ? { ...l, label: newName } : l));
  };

  const handleMouseDown = (e) => {
    if (!capturedImage) return;
    if (augMode !== "original") return;
    const pos = getMousePos(e);

    if (isKeypointMode) {
      const vertexHit = findPoseVertexAt(pos);
      if (vertexHit) {
        pushHistory();
        setDraggingPoseVertex(vertexHit);
        suppressNextClickRef.current = true;
      }
      return;
    }

    if (isLandmarkMode) {
      const vertexHit = findLandmarkVertexAt(pos);
      if (vertexHit) {
        pushHistory();
        setDraggingLandmarkVertex(vertexHit);
        suppressNextClickRef.current = true;
      }
      return;
    }

    if (isSegmentation) {
      const vertexHit = findPolygonVertexAt(pos);
      if (vertexHit) {
        pushHistory();
        setDraggingVertex(vertexHit);
        suppressNextClickRef.current = true;
        return;
      }

      if (currentPolygonPoints.length === 0) {
        const nearEdge = findPolygonEdgeInsertion(pos);
        if (!nearEdge) {
          for (let pi = polygons.length - 1; pi >= 0; pi--) {
            if (pointInPolygon(pos, polygons[pi].points)) {
              pushHistory();
              setDraggingPolygonMove({
                polygonId: polygons[pi].id,
                startPos: pos,
                originalPoints: polygons[pi].points.map(p => ({ ...p }))
              });
              suppressNextClickRef.current = true;
              return;
            }
          }
        }
      }

      return;
    }

    // 🔒 V3: Blur mode - drag-draw the box for the area to be blurred (same as a box, but without resize handles/label)
    if (isBlurMode) {
      setIsDrawingBlur(true);
      setBlurStartPos(pos);
      setCurrentBlurBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
      return;
    }

    const handle = findHandleAtPos(pos);
    if (handle) {
      pushHistory();
      const targetBox = boxes.find(b => b.id === handle.boxId);
      setEditingHandle({
        boxId: handle.boxId,
        type: handle.type,
        startPos: pos,
        original: { ...targetBox }
      });
      return;
    }

    setIsDrawing(true);
    setStartPos(pos);
    setCurrentBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleContainerMouseDown = (e) => {
  if (e.button === 1) {
    e.preventDefault();
    if (!capturedImage || zoomLevel <= 1) return;
    setIsPanning(true);
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      offsetX: panOffset.x,
      offsetY: panOffset.y
    };
    return;
  }

  // 🆕 Right-click + hovering on a Polygon point = start dragging that point right away (instead of popping the delete-whole-shape menu)
  if (e.button === 2) {
    if (!capturedImage || augMode !== "original" || !isSegmentation) return;
    const pos = getMousePos(e);
    const vertexHit = findPolygonVertexAt(pos);
    if (vertexHit) {
      e.preventDefault();
      pushHistory();
      setDraggingVertex(vertexHit);
      isRightDragRef.current = true; // prevent the following contextmenu from deleting the whole shape
    }
    return;
  }

  handleMouseDown(e);
};

  const handleMouseMove = (e) => {
    if (isKeypointMode) {
      const pos = getMousePos(e);
      if (draggingPoseVertex) {
        setPoses(prev => prev.map(pose =>
          pose.id === draggingPoseVertex.poseId
            ? {
                ...pose,
                keypoints: pose.keypoints.map((p, i) =>
                  i === draggingPoseVertex.pointIndex ? { ...p, x: pos.x, y: pos.y } : p
                )
              }
            : pose
        ));
        return;
      }
      if (augMode === "original") {
        const vertexHit = findPoseVertexAt(pos);
        setHoverCursor(vertexHit ? "grab" : null);
      }
      return;
    }

    if (isLandmarkMode) {
      const pos = getMousePos(e);
      if (draggingLandmarkVertex) {
        setLandmarks(prev => prev.map(lm =>
          lm.id === draggingLandmarkVertex.landmarkId
            ? {
                ...lm,
                points: lm.points.map((p, i) =>
                  i === draggingLandmarkVertex.pointIndex ? { ...p, x: pos.x, y: pos.y } : p
                )
              }
            : lm
        ));
        return;
      }
      if (augMode === "original") {
        const vertexHit = findLandmarkVertexAt(pos);
        setHoverCursor(vertexHit ? "grab" : null);
      }
      return;
    }

    if (isSegmentation) {
      const pos = getMousePos(e);

      if (draggingPolygonLabelState) {
        const dx = pos.x - draggingPolygonLabelState.startPos.x;
        const dy = pos.y - draggingPolygonLabelState.startPos.y;
        setPolygons(prev => prev.map(p =>
          p.id === draggingPolygonLabelState.polygonId
            ? { ...p, labelOffset: { x: draggingPolygonLabelState.originalOffset.x + dx, y: draggingPolygonLabelState.originalOffset.y + dy } }
            : p
        ));
        return;
      }

      if (draggingVertex) {
        setPolygons(prev => prev.map(poly =>
          poly.id === draggingVertex.polygonId
            ? {
                ...poly,
                points: poly.points.map((p, i) =>
                  i === draggingVertex.pointIndex ? { x: pos.x, y: pos.y } : p
                )
              }
            : poly
        ));
        return;
      }

      if (draggingPolygonMove) {
        const dx = pos.x - draggingPolygonMove.startPos.x;
        const dy = pos.y - draggingPolygonMove.startPos.y;
        setPolygons(prev => prev.map(poly =>
          poly.id === draggingPolygonMove.polygonId
            ? { ...poly, points: draggingPolygonMove.originalPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) }
            : poly
        ));
        return;
      }

      if (currentPolygonPoints.length > 0 && augMode === "original") {
        setHoverPoint(pos);
        return;
      }

       if (augMode === "original") {
  const vertexHit = findPolygonVertexAt(pos);
  hoveredPolygonVertexRef.current = vertexHit; // 🆕 remember for use with the 'd' key
  if (vertexHit) {
    setHoverCursor("grab");
  } else if (currentPolygonPoints.length === 0 && findPolygonEdgeInsertion(pos)) {
    setHoverCursor("copy");
  } else if (currentPolygonPoints.length === 0 && polygons.some(poly => pointInPolygon(pos, poly.points))) {
    setHoverCursor("move");
  } else {
    setHoverCursor(null);
  }
}
      return;
    }

    // 🔒 V3: Blur mode - update the box currently being drag-drawn (doesn't touch the box's resize/hover logic)
    if (isBlurMode) {
      if (!isDrawingBlur || !currentBlurBox) return;
      const pos = getMousePos(e);
      const x = Math.min(blurStartPos.x, pos.x);
      const y = Math.min(blurStartPos.y, pos.y);
      const w = Math.abs(blurStartPos.x - pos.x);
      const h = Math.abs(blurStartPos.y - pos.y);
      setCurrentBlurBox({ x, y, w, h });
      return;
    }

    const pos = getMousePos(e);

    if (draggingBoxLabel) {
      const dx = pos.x - draggingBoxLabel.startPos.x;
      const dy = pos.y - draggingBoxLabel.startPos.y;
      setBoxes(prev => prev.map(b =>
        b.id === draggingBoxLabel.boxId
          ? { ...b, labelOffset: { x: draggingBoxLabel.originalOffset.x + dx, y: draggingBoxLabel.originalOffset.y + dy } }
          : b
      ));
      return;
    }

    if (editingHandle) {
      const dx = pos.x - editingHandle.startPos.x;
      const dy = pos.y - editingHandle.startPos.y;
      const orig = editingHandle.original;
      let newX = orig.x, newY = orig.y, newW = orig.w, newH = orig.h;

      switch (editingHandle.type) {
        case "edge-top": {
          const h = Math.max(MIN_BOX_SIZE, orig.h - dy);
          newY = orig.y + (orig.h - h);
          newH = h;
          break;
        }
        case "edge-bottom": {
          newH = Math.max(MIN_BOX_SIZE, orig.h + dy);
          break;
        }
        case "edge-left": {
          const w = Math.max(MIN_BOX_SIZE, orig.w - dx);
          newX = orig.x + (orig.w - w);
          newW = w;
          break;
        }
        case "edge-right": {
          newW = Math.max(MIN_BOX_SIZE, orig.w + dx);
          break;
        }
        case "corner": {
          newX = orig.x + dx;
          newY = orig.y + dy;
          break;
        }
        default:
          break;
      }

      const rect = imageContainerRef.current?.getBoundingClientRect();
      if (rect) {
        newX = Math.max(0, Math.min(newX, rect.width - newW));
        newY = Math.max(0, Math.min(newY, rect.height - newH));
      }

      setBoxes(prev => prev.map(b =>
        b.id === editingHandle.boxId ? { ...b, x: newX, y: newY, w: newW, h: newH } : b
      ));
      return;
    }

    if (!isDrawing) {
      const handle = findHandleAtPos(pos);
      setHoverCursor(handle ? getCursorForHandleType(handle.type) : null);
    }

    if (!isDrawing || !currentBox) return;

    const x = Math.min(startPos.x, pos.x);
    const y = Math.min(startPos.y, pos.y);
    const w = Math.abs(startPos.x - pos.x);
    const h = Math.abs(startPos.y - pos.y);

    setCurrentBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (isKeypointMode) {
      if (draggingPoseVertex) setDraggingPoseVertex(null);
      return;
    }

    if (isLandmarkMode) {
      if (draggingLandmarkVertex) setDraggingLandmarkVertex(null);
      return;
    }

    // 🔒 V3: Blur mode - finish drawing, save the new blur box (if big enough, to prevent accidental clicks)
    if (isBlurMode) {
      if (!isDrawingBlur || !currentBlurBox) return;
      setIsDrawingBlur(false);
      if (currentBlurBox.w > 5 && currentBlurBox.h > 5) {
        pushHistory();
        setBlurRegions(prev => [...prev, { ...currentBlurBox, id: Date.now(), color: blurColor }]);
      }
      setCurrentBlurBox(null);
      return;
    }

    if (isSegmentation) {
      if (draggingPolygonLabelState) { setDraggingPolygonLabelState(null); return; }
      if (draggingVertex) setDraggingVertex(null);
      if (draggingPolygonMove) setDraggingPolygonMove(null);
      return;
    }

    if (editingHandle) {
      setEditingHandle(null);
      return;
    }

    if (draggingBoxLabel) {
      setDraggingBoxLabel(null);
      return;
    }

    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);

    if (currentBox.w > 5 && currentBox.h > 5) {
      pushHistory();
      setBoxes([...boxes, { ...currentBox, id: Date.now(), label: "object", colorOverride: boxColorChoice !== AUTO_COLOR_VALUE ? boxColorChoice : undefined }]);
    }
    setCurrentBox(null);
  };

  const handleContainerMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setPanOffset(clampPanOffset({
        x: panStartRef.current.offsetX + dx,
        y: panStartRef.current.offsetY + dy
      }));
      return;
    }
    handleMouseMove(e);
  };

  const handleContainerMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    handleMouseUp();
  };

  const deleteBox = (id) => {
    pushHistory();
    setBoxes(boxes.filter(box => box.id !== id));
    if (editingBoxLabelId === id) setEditingBoxLabelId(null);
  };

  const handleLabelChange = (id, newName) => {
    setBoxes(boxes.map(b => b.id === id ? { ...b, label: newName } : b));
  };

  // 🔒 V3: delete an already-drawn blur area
  const deleteBlurRegion = (id) => {
    pushHistory();
    setBlurRegions(prev => prev.filter(r => r.id !== id));
  };

  // ==========================================================
  // ⬡ Polygon (Segmentation mode)
  // ==========================================================
  const finishPolygon = () => {
    if (currentPolygonPoints.length < 3) {
      alert("You must click at least 3 points before you can close the Polygon shape.");
      return;
    }
    pushHistory();
    setPolygons(prev => [...prev, { id: Date.now(), label: "object", points: currentPolygonPoints, colorOverride: polygonColorChoice !== AUTO_COLOR_VALUE ? polygonColorChoice : undefined }]);
    setCurrentPolygonPoints([]);
    setHoverPoint(null);
  };

  const undoLastPolygonPoint = () => {
    setCurrentPolygonPoints(prev => prev.slice(0, -1));
  };

  const cancelCurrentPolygon = () => {
    setCurrentPolygonPoints([]);
    setHoverPoint(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const isTextInput = tag === "INPUT" || tag === "TEXTAREA";
      if (isTextInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const hovered = hoveredLabelRef.current;
        if (!hovered) return;
        e.preventDefault();
        if (hovered.type === "box") {
          const target = boxes.find(b => b.id === hovered.id);
          if (target) clipboardRef.current = { type: "box", data: { ...target } };
        } else if (hovered.type === "polygon") {
          const target = polygons.find(p => p.id === hovered.id);
          if (target) {
            clipboardRef.current = {
              type: "polygon",
              data: { ...target, points: target.points.map(pt => ({ ...pt })) }
            };
          }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (!clipboardRef.current) return;
        e.preventDefault();
        pasteClipboardShape();
        return;
      }

      if (isSegmentation && currentPolygonPoints.length > 0) {
        if (e.key.toLowerCase() === "r") {
          e.preventDefault();
          undoLastPolygonPoint();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelCurrentPolygon();
          return;
        }
      }

     if (isSegmentation && currentPolygonPoints.length > 0) {
  if (e.key.toLowerCase() === "r") {
    e.preventDefault();
    undoLastPolygonPoint();
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    cancelCurrentPolygon();
    return;
  }
}

// 🆕 Press 'd' while hovering an already-drawn Polygon point (not while drawing a new one) -> delete just that one point
if (isSegmentation && e.key.toLowerCase() === "d") {
  e.preventDefault();
  deleteHoveredPolygonVertex();
  return;
}

      if (isLandmarkMode && currentLandmarkPoints.length > 0) {
        if (e.key.toLowerCase() === "r") {
          e.preventDefault();
          undoLastLandmarkPoint();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelCurrentLandmark();
          return;
        }
      }

      if (e.key === "Escape" && isCanvasFullscreen) {
        e.preventDefault();
        setIsCanvasFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSegmentation, currentPolygonPoints, isKeypointMode, currentPoseKeypoints, isLandmarkMode, currentLandmarkPoints, isCanvasFullscreen, boxes, polygons]);

  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;

    const handleWheelZoom = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoomLevel((prev) => {
        const next = prev - e.deltaY * 0.0025;
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(3))));
        setPanOffset((prevPan) => clampPanOffset(prevPan, clamped));
        return clamped;
      });
    };

    el.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => el.removeEventListener("wheel", handleWheelZoom);
  }, []);

  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;

    const prevSize = { width: 0, height: 0 };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const newWidth = entry.contentRect.width;
      const newHeight = entry.contentRect.height;
      const { width: oldWidth, height: oldHeight } = prevSize;

      if (
        oldWidth > 0 &&
        oldHeight > 0 &&
        (Math.abs(newWidth - oldWidth) > 0.5 || Math.abs(newHeight - oldHeight) > 0.5)
      ) {
        const oldRect = getImageDisplayRect(oldWidth, oldHeight, imgNaturalSize.width, imgNaturalSize.height);
        const newRect = getImageDisplayRect(newWidth, newHeight, imgNaturalSize.width, imgNaturalSize.height);

        const remapPoint = (p) => {
          const fracX = oldRect.width > 0 ? (p.x - oldRect.offsetX) / oldRect.width : 0;
          const fracY = oldRect.height > 0 ? (p.y - oldRect.offsetY) / oldRect.height : 0;
          return {
            x: newRect.offsetX + fracX * newRect.width,
            y: newRect.offsetY + fracY * newRect.height
          };
        };

        const labelScaleX = oldRect.width > 0 ? newRect.width / oldRect.width : 1;
        const labelScaleY = oldRect.height > 0 ? newRect.height / oldRect.height : 1;

        setBoxes(prev => prev.map(b => {
          const topLeft = remapPoint({ x: b.x, y: b.y });
          const bottomRight = remapPoint({ x: b.x + b.w, y: b.y + b.h });
          const oldOffset = b.labelOffset || { x: 0, y: 0 };
          return {
            ...b,
            x: topLeft.x,
            y: topLeft.y,
            w: bottomRight.x - topLeft.x,
            h: bottomRight.y - topLeft.y,
            labelOffset: { x: oldOffset.x * labelScaleX, y: oldOffset.y * labelScaleY }
          };
        }));

        setPolygons(prev => prev.map(p => {
          const oldOffset = p.labelOffset || { x: 0, y: 0 };
          return {
            ...p,
            points: p.points.map(pt => remapPoint(pt)),
            labelOffset: { x: oldOffset.x * labelScaleX, y: oldOffset.y * labelScaleY }
          };
        }));

        // 🔒 V3: Blur regions also need to be rescaled the same way as boxes (top-left corner + bottom-right corner)
        setBlurRegions(prev => prev.map(r => {
          const topLeft = remapPoint({ x: r.x, y: r.y });
          const bottomRight = remapPoint({ x: r.x + r.w, y: r.y + r.h });
          return {
            ...r,
            x: topLeft.x,
            y: topLeft.y,
            w: bottomRight.x - topLeft.x,
            h: bottomRight.y - topLeft.y
          };
        }));

        // 🦴 V8: Pose keypoints are also rescaled the same way (remapping each point)
        setPoses(prev => prev.map(pose => ({
          ...pose,
          keypoints: pose.keypoints.map(pt => ({ ...pt, ...remapPoint(pt) }))
        })));

        // 📍 V8: Landmark points are also rescaled the same way
        setLandmarks(prev => prev.map(lm => ({
          ...lm,
          points: lm.points.map(pt => ({ ...pt, ...remapPoint(pt) }))
        })));

        setCurrentPolygonPoints(prev => prev.map(pt => remapPoint(pt)));
        setCurrentPoseKeypoints(prev => prev.map(pt => ({ ...pt, ...remapPoint(pt) })));
        setCurrentLandmarkPoints(prev => prev.map(pt => ({ ...pt, ...remapPoint(pt) })));

        const scaleX = newWidth / oldWidth;
        const scaleY = newHeight / oldHeight;
        setPanOffset(prev => clampPanOffset({ x: prev.x * scaleX, y: prev.y * scaleY }));
      }

      prevSize.width = newWidth;
      prevSize.height = newHeight;
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [imgNaturalSize]);

  const addPolygonPointAt = (pos) => {
    if (currentPolygonPoints.length >= 3) {
      const first = currentPolygonPoints[0];
      const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
      if (dist <= CLOSE_POLYGON_RADIUS) {
        finishPolygon();
        return;
      }
    }
    setCurrentPolygonPoints(prev => [...prev, pos]);
  };

  const handleContainerClick = (e) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (!capturedImage || augMode !== "original") return;
    const pos = getMousePos(e);

    if (isKeypointMode) {
      addPoseKeypointAt(pos);
      return;
    }

    if (isLandmarkMode) {
      addLandmarkPointAt(pos);
      return;
    }

    if (!isSegmentation) return;

    if (currentPolygonPoints.length === 0) {
      const edgeHit = findPolygonEdgeInsertion(pos);
      if (edgeHit) {
        insertPolygonPoint(edgeHit.polygonId, edgeHit.insertIndex, pos);
        return;
      }
    }

    addPolygonPointAt(pos);
  };

  const pasteClipboardShape = () => {
    const clip = clipboardRef.current;
    if (!clip) return;

    const rect = imageContainerRef.current?.getBoundingClientRect();
    const OFFSET = 24;

    pushHistory();

    if (clip.type === "box") {
      const original = clip.data;
      let newX = original.x + OFFSET;
      let newY = original.y + OFFSET;
      if (rect) {
        newX = Math.min(newX, Math.max(0, rect.width - original.w));
        newY = Math.min(newY, Math.max(0, rect.height - original.h));
      }
      setBoxes(prev => [...prev, { ...original, id: Date.now(), x: newX, y: newY }]);
    } else if (clip.type === "polygon") {
      const original = clip.data;
      const newPoints = original.points.map(p => ({ x: p.x + OFFSET, y: p.y + OFFSET }));
      setPolygons(prev => [...prev, { ...original, id: Date.now(), points: newPoints }]);
    }
  };

  const deletePolygon = (id) => {
    pushHistory();
    setPolygons(polygons.filter(p => p.id !== id));
    if (editingPolygonLabelId === id) setEditingPolygonLabelId(null);
    if (draggingVertex && draggingVertex.polygonId === id) setDraggingVertex(null);
  };

  // 🆕 delete just the single vertex of the Polygon currently being hovered (press 'd')
// if deleting it leaves fewer than 3 points (Polygon becomes invalid), the entire shape is also deleted
const deleteHoveredPolygonVertex = () => {
  const hovered = hoveredPolygonVertexRef.current;
  if (!hovered) return;

  pushHistory();
  setPolygons(prev =>
    prev
      .map(poly => {
        if (poly.id !== hovered.polygonId) return poly;
        const newPoints = poly.points.filter((_, i) => i !== hovered.pointIndex);
        return { ...poly, points: newPoints };
      })
      .filter(poly => poly.points.length >= 3)
  );

  hoveredPolygonVertexRef.current = null;
  setHoverCursor(null);
};

  const handlePolygonLabelChange = (id, newName) => {
    setPolygons(polygons.map(p => p.id === id ? { ...p, label: newName } : p));
  };

  // ==========================================================
  // 🎨 V4: automatically assign a border/label color based on the class (label) name
  // Uses a hash of the label text mod the number of colors in the palette, so that
  // "the same label always gets the same color" whether it's a Bounding Box or Polygon.
  // Helps visually separate multiple labels mixed in the same image, e.g. "helmet" vs
  // "no_helmet" instantly get different colors — no manual setup needed, adding a new
  // label automatically gets a new color from the palette
  // ==========================================================
  const LABEL_COLOR_PALETTE = [
    "#10B981", // green
    "#EF4444", // red
    "#0078D7", // blue
    "#F59E0B", // orange/yellow
    "#8B5CF6", // purple
    "#EC4899", // pink
    "#14B8A6", // teal
    "#F97316", // dark orange
    "#6366F1", // indigo
    "#84CC16", // lime green
  ];

  const getColorForLabel = (label) => {
    const str = (label || "object").trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return LABEL_COLOR_PALETTE[hash % LABEL_COLOR_PALETTE.length];
  };

  // Convert hex color -> "r, g, b" string (used for the translucent background of a box/polygon based on the label color)
  const hexToRgbString = (hex) => {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  };

  // ==========================================================
  // 🖱️ Right-click -> immediately delete the box/polygon/blur region/pose/landmark at the pointed-at position
  // ==========================================================
  const pointInBox = (pos, box) =>
    pos.x >= box.x && pos.x <= box.x + box.w && pos.y >= box.y && pos.y <= box.y + box.h;

  const pointInPolygon = (pos, points) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      const intersect = ((yi > pos.y) !== (yj > pos.y)) &&
        (pos.x < ((xj - xi) * (pos.y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleContainerContextMenu = (e) => {
    e.preventDefault();

    // 🆕 If a right-click was just used to drag a Polygon point, don't run the delete logic below
    if (isRightDragRef.current) {
      isRightDragRef.current = false;
      return;
    }

    if (!capturedImage || augMode !== "original") return;

    const pos = getMousePos(e);

    // 🦴📍 V8: check pose/landmark points first (delete the whole set if right-clicked near any one point)
    const poseHit = findPoseVertexAt(pos);
    if (poseHit) {
      deletePose(poseHit.poseId);
      return;
    }
    const landmarkHit = findLandmarkVertexAt(pos);
    if (landmarkHit) {
      deleteLandmark(landmarkHit.landmarkId);
      return;
    }

    for (let i = polygons.length - 1; i >= 0; i--) {
      if (pointInPolygon(pos, polygons[i].points)) {
        deletePolygon(polygons[i].id);
        return;
      }
    }
    for (let i = boxes.length - 1; i >= 0; i--) {
      if (pointInBox(pos, boxes[i])) {
        deleteBox(boxes[i].id);
        return;
      }
    }
    for (let i = blurRegions.length - 1; i >= 0; i--) {
      if (pointInBox(pos, blurRegions[i])) {
        deleteBlurRegion(blurRegions[i].id);
        return;
      }
    }
  };

  const handleAugModeChange = (newMode) => {
    if (isSegmentation && currentPolygonPoints.length > 0 && newMode !== "original") {
      const confirmed = window.confirm(
        "There's an unfinished Polygon (not yet closed). Switching modes will discard those points. Do you want to continue?"
      );
      if (!confirmed) return;
      setCurrentPolygonPoints([]);
      setHoverPoint(null);
    }
    setAugMode(newMode);
  };

  // 🌟 V2/V3/V8: switch the annotation drawing mode (Bounding Box <-> Polygon <-> Blur <-> Pose <-> Landmark)
  const handleAnnotationModeChange = (newMode) => {
    if (newMode === annotationMode) return;
    if (annotationMode === "polygon" && currentPolygonPoints.length > 0) {
      const confirmed = window.confirm(
        "There's an unfinished Polygon (not yet closed). Switching modes will discard those points. Do you want to continue?"
      );
      if (!confirmed) return;
      setCurrentPolygonPoints([]);
      setHoverPoint(null);
    }
    if (annotationMode === "keypoint" && currentPoseKeypoints.length > 0) {
      const confirmed = window.confirm(
        "There's an unfinished Pose (not yet complete). Switching modes will discard those points. Do you want to continue?"
      );
      if (!confirmed) return;
      setCurrentPoseKeypoints([]);
    }
    if (annotationMode === "landmark" && currentLandmarkPoints.length > 0) {
      const confirmed = window.confirm(
        "There's an unfinished Landmark (not yet complete). Switching modes will discard those points. Do you want to continue?"
      );
      if (!confirmed) return;
      setCurrentLandmarkPoints([]);
    }
    setEditingHandle(null);
    setHoverCursor(null);
    setIsDrawingBlur(false);
    setCurrentBlurBox(null);
    hoveredPolygonVertexRef.current = null; // 🆕
    setAnnotationMode(newMode);
  };

  const getPreviewTransform = () => {
    switch (augMode) {
      case "rotation_-10": return "rotate(-10deg)";
      case "rotation_10": return "rotate(10deg)";
      case "zoom_in": return "scale(1.15)";
      case "flip_horizontal": return "scaleX(-1)";
      default: return "none";
    }
  };

  const getCombinedTransform = () => {
    const preview = getPreviewTransform();
    const parts = [];
    if (panOffset.x !== 0 || panOffset.y !== 0) {
      parts.push(`translate(${panOffset.x}px, ${panOffset.y}px)`);
    }
    if (preview !== "none") parts.push(preview);
    if (zoomLevel !== 1) parts.push(`scale(${zoomLevel})`);
    return parts.length ? parts.join(" ") : "none";
  };

  const getPreviewFilter = () => {
    switch (augMode) {
      case "brightness_dark": return "brightness(0.6)";
      case "brightness_bright": return "brightness(1.4)";
      case "grayscale": return "grayscale(1)";
      case "blur": return "blur(3px)";
      case "contrast_low": return "contrast(0.6)";
      case "contrast_high": return "contrast(1.6)";
      case "saturation_low": return "saturate(0.3)";
      case "saturation_high": return "saturate(2.2)";
      default: return "none";
    }
  };

  const getReadinessStatus = () => {
    const estimatedBoxes = totalImagesSaved * 3;

    if (totalImagesSaved <= 20) {
      return {
        text: `🔴 Not enough data yet (${totalImagesSaved} images) — the model may suffer from severe overfitting`,
        color: "#EF4444",
        bg: "#FEF2F2",
        percent: Math.min((totalImagesSaved / 100) * 100, 20)
      };
    } else if (totalImagesSaved <= 80) {
      return {
        text: `🟡 Starter-level data (${totalImagesSaved} images)`,
        color: "#F59E0B",
        bg: "#FEF3C7",
        percent: (totalImagesSaved / 100) * 100
      };
    } else {
      return {
        text: `🟢 Enough data for a basic level (${totalImagesSaved} images) — you can proceed to the model training step`,
        color: "#10B981",
        bg: "#ECFDF5",
        percent: 100
      };
    }
  };

  const status = getReadinessStatus();

  const getCanvasFilter = (mode) => {
    switch (mode) {
      case "brightness_dark": return "brightness(0.6)";
      case "brightness_bright": return "brightness(1.4)";
      case "grayscale": return "grayscale(1)";
      case "blur": return "blur(3px)";
      case "contrast_low": return "contrast(0.6)";
      case "contrast_high": return "contrast(1.6)";
      case "saturation_low": return "saturate(0.3)";
      case "saturation_high": return "saturate(2.2)";
      default: return "none";
    }
  };

  const getTransformForMode = (mode) => {
    switch (mode) {
      case "rotation_-10": return "rotate(-10deg)";
      case "rotation_10": return "rotate(10deg)";
      case "zoom_in": return "scale(1.15)";
      case "flip_horizontal": return "scaleX(-1)";
      default: return "none";
    }
  };

  const AUGMENTATION_MODES = [
    { value: "original", label: "📦 Original" },
    { value: "rotation_-10", label: "↩️ Rotate -10°" },
    { value: "rotation_10", label: "↪️ Rotate 10°" },
    { value: "zoom_in", label: "🔍 Zoom In" },
    { value: "brightness_dark", label: "🌙 Darker" },
    { value: "brightness_bright", label: "☀️ Brighter" },
    { value: "grayscale", label: "⚫ Grayscale" },
    { value: "blur", label: "💧 Blur" },
    { value: "contrast_low", label: "🔅 Low Contrast" },
    { value: "contrast_high", label: "🔆 High Contrast" },
    { value: "saturation_low", label: "🎨 Low Saturation" },
    { value: "saturation_high", label: "🌈 High Saturation" }
  ];

  // ==========================================================
  // 🔒 V3: "bake" the blur permanently into the actual image pixels before uploading to the server
  // Uses the Pixelate/Mosaic technique (shrink just that area down heavily then scale it back up
  // without smoothing) instead of ordinary gaussian blur, because pixelation guarantees the
  // original face/data can never be recovered from it
  // ==========================================================
  const applyBlurRegionsToImage = (imageDataUrl, regions, containerRect, naturalW, naturalH) => {
    return new Promise((resolve, reject) => {
      if (!regions || regions.length === 0) {
        resolve(imageDataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = naturalW;
          canvas.height = naturalH;
          const ctx = canvas.getContext("2d");

          ctx.drawImage(img, 0, 0, naturalW, naturalH);

          const displayRect = getImageDisplayRect(containerRect.width, containerRect.height, naturalW, naturalH);
          const scaleX = displayRect.width > 0 ? naturalW / displayRect.width : 1;
          const scaleY = displayRect.height > 0 ? naturalH / displayRect.height : 1;

          regions.forEach((region) => {
            const imgX = Math.max(0, Math.round((region.x - displayRect.offsetX) * scaleX));
            const imgY = Math.max(0, Math.round((region.y - displayRect.offsetY) * scaleY));
            const imgW = Math.min(naturalW - imgX, Math.round(region.w * scaleX));
            const imgH = Math.min(naturalH - imgY, Math.round(region.h * scaleY));

            if (imgW <= 0 || imgH <= 0) return;

            const pixelSize = Math.max(4, Math.round(Math.min(imgW, imgH) / 12));
            const smallW = Math.max(1, Math.round(imgW / pixelSize));
            const smallH = Math.max(1, Math.round(imgH / pixelSize));

            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = smallW;
            tempCanvas.height = smallH;
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.drawImage(img, imgX, imgY, imgW, imgH, 0, 0, smallW, smallH);

            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tempCanvas, 0, 0, smallW, smallH, imgX, imgY, imgW, imgH);
            ctx.imageSmoothingEnabled = true;
          });

          resolve(canvas.toDataURL("image/jpeg", 0.92));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = imageDataUrl;
    });
  };

  const saveAllModesToDataset = async () => {
    const serverUrl = localStorage.getItem("cloud_url");
    const email = localStorage.getItem("email");

    // 🆕 Check quota before generating the 12 variants
  if (isOverImageQuota) {
    alert(`You've used up your image quota (${totalImagesUsed}/${maxImages} images). Please upgrade your plan.`);
    return;
  }
  if (willExceedOnSave) {
    const proceed = window.confirm(
      `You have ${remainingImages} images left in your quota, but this save will create ${SAVE_MULTIPLIER} images and may exceed it.\n\nDo you want to continue?`
    );
    if (!proceed) return;
  }

    if (!serverUrl || !email) {
      alert("Please check your Cloud URL settings and make sure you're logged in.");
      return;
    }

    if (boxes.length === 0 && polygons.length === 0 && poses.length === 0 && landmarks.length === 0) {
      alert("Please draw at least one Bounding Box, Polygon, Pose, or Landmark before saving.");
      return;
    }

    if (allModesSaved) {
      alert("This image has already been saved in all 12 variants. Please capture/upload a new image first.");
      return;
    }

    setIsSubmitting(true);
    const cleanServerUrl = serverUrl.replace(/\/$/, "");

    const container = imageContainerRef.current.getBoundingClientRect();

    try {
      // 🔒 V3: bake the drawn areas into the actual image pixels before sending (if there are
      // no blur regions at all, this function just returns the original image, no change to the existing flow)
      const finalImageData = await applyBlurRegionsToImage(
        capturedImage,
        blurRegions,
        container,
        imgNaturalSize.width,
        imgNaturalSize.height
      );

      const payload = {
        email: email,
        project_name: project,
        image_data: finalImageData,
        canvas_width: Math.round(container.width),
        canvas_height: Math.round(container.height),
        bounding_boxes: boxes.map(box => ({
          label: box.label,
          x: Math.round(box.x),
          y: Math.round(box.y),
          w: Math.round(box.w),
          h: Math.round(box.h)
        })),
        polygons: polygons.map(poly => ({
          label: poly.label,
          points: poly.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))
        })),
        // 🦴 V8: send the pose keypoint set with point names and connecting lines (skeleton) referenced by index
        poses: poses.map(pose => ({
          label: pose.label,
          keypoints: pose.keypoints.map(p => ({
            name: p.name,
            x: Math.round(p.x),
            y: Math.round(p.y),
            visible: p.visible !== false ? 1 : 0
          })),
          skeleton: POSE_TEMPLATE.connections
        })),
        // 📍 V8: send the landmark set along with the template used (face/hand) and that template's connecting lines
        landmarks: landmarks.map(lm => ({
          label: lm.label,
          template: lm.templateType,
          points: lm.points.map(p => ({
            name: p.name,
            x: Math.round(p.x),
            y: Math.round(p.y)
          })),
          connections: LANDMARK_TEMPLATES[lm.templateType].connections
        }))
      };

      const response = await fetch(`${cleanServerUrl}/api/upload_dataset_all_modes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const totalSaved = result.total_saved || 0;
        const newTotal = totalImagesSaved + totalSaved;
        setTotalImagesSaved(newTotal);
        localStorage.setItem("total_images", newTotal);
        setAllModesSaved(true);

        alert(`Saved successfully: ${totalSaved}/12 variants! (Total so far: ${newTotal} images)`);

        fetchProjectGallery();
      } else {
        alert(`Server Error: ${result.message || "A data storage error occurred"}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Couldn't connect to the server. Please check your network.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearWorkspace = () => {
    setCapturedImage(null);
    resetAnnotations();
  };

  const annotationCount = boxes.length + polygons.length + poses.length + landmarks.length;
  const saveDisabled = annotationCount === 0 || isSubmitting || allModesSaved;

  const isEsp32StreamShown = cameraSource === "esp32" && !!esp32IpConnected;

  const SAVE_MULTIPLIER = 12; // saveAllModesToDataset generates 12 variants per save
const totalImagesUsed = planUsage?.totalImages ?? null;
const maxImages = planLimits?.maxImages ?? null;
const hasQuotaInfo = totalImagesUsed != null && maxImages != null;
const isUnlimitedImages = hasQuotaInfo && !Number.isFinite(maxImages);
const remainingImages = hasQuotaInfo && !isUnlimitedImages
  ? Math.max(0, maxImages - totalImagesUsed) : null;
const isOverImageQuota = remainingImages !== null && remainingImages <= 0;
const willExceedOnSave = remainingImages !== null && remainingImages < SAVE_MULTIPLIER;


  return (
    <div style={{ maxWidth: 1500, margin: "30px auto", padding: 25, fontFamily: "Segoe UI, sans-serif" }}>

      <datalist id="class-suggestions">
        {knownClasses.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 25 }}>
        <div>
          <button onClick={() => navigate(-1)} style={{ padding: "8px 16px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer", marginRight: 15 }}>🎒 Back to Home</button>
          <span style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>Project: {project}</span>
        </div>
        <h2 style={{ margin: 0, color: "#E28743" }}>{pageTitle}</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 25, marginBottom: 25 }}>

        <div style={{ background: "#fff", padding: 20, borderRadius: 15, border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
          <h3 style={{ marginTop: 0, marginBottom: 15 }}>📷 Input Source (image used for Annotation)</h3>

          <div style={{ marginBottom: 15, padding: 12, background: "#EFF6FF", borderRadius: 10, border: "1px solid #BFDBFE" }}>
            <div style={{ fontSize: 13, fontWeight: "bold", color: "#1E40AF", marginBottom: 8 }}>
              🎯  Set the ideal image size for your deployment
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={MIN_TARGET_IMAGE_SIZE}
                max={MAX_TARGET_IMAGE_SIZE}
                step={32}
                value={targetImageSize}
                disabled={!!capturedImage}
                onChange={(e) => setTargetImageSize(e.target.value)}
                title={capturedImage ? "Clear the current image first before you can change the size" : ""}
                style={{
                  width: 100,
                  padding: "8px 10px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid #93C5FD",
                  cursor: capturedImage ? "not-allowed" : "text",
                  opacity: capturedImage ? 0.6 : 1,
                  background: "#fff"
                }}
              />
              <span style={{ fontSize: 13, color: "#1E40AF" }}>px</span>
            </div>
            {capturedImage && (
              <p style={{ fontSize: 11, color: "#94A3B8", margin: "6px 0 0" }}>
                🔒 Locked while an image is in the workspace — click "Discard this image" on the right first if you want to change the size
              </p>
            )}
          </div>

          <div style={{ marginBottom: 15, padding: 12, background: "#F8FAFC", borderRadius: 10, border: "1px solid #E2E8F0" }}>
            <div style={{ fontSize: 13, fontWeight: "bold", color: "#475569", marginBottom: 8 }}>
              🏷️ Pre-add class names (Labels)
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: knownClasses.length > 0 ? 10 : 0 }}>
              <input
                type="text"
                value={newClassInput}
                onChange={(e) => setNewClassInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKnownClassFromInput();
                  }
                }}
                placeholder="e.g. red_cap, button, green_light"
                style={{ flex: 1, padding: "8px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #CBD5E1" }}
              />
              <button
                onClick={addKnownClassFromInput}
                disabled={!newClassInput.trim()}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: "bold",
                  borderRadius: 8,
                  border: "none",
                  cursor: newClassInput.trim() ? "pointer" : "not-allowed",
                  background: newClassInput.trim() ? "#0078D7" : "#ccc",
                  color: "#fff",
                  whiteSpace: "nowrap"
                }}
              >
                ➕ Add
              </button>
            </div>

            {knownClasses.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {knownClasses.map((c) => (
                  <span
                    key={c}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "#EAF3FC",
                      color: "#0078D7",
                      fontSize: 12,
                      fontWeight: "bold",
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: "1px solid #BFDBFE"
                    }}
                  >
                    {c}
                    <button
                      onClick={() => removeKnownClass(c)}
                      title="Remove this class name from the list"
                      style={{ background: "none", border: "none", color: "#0078D7", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 11.5, color: "#94A3B8", margin: 0 }}>
                No classes added yet — type a name and press "Add" or Enter
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 18, marginBottom: 12, fontSize: 13.5, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                checked={cameraSource === "browser"}
                onChange={() => handleSelectCameraSource("browser")}
              />
              🎥 PC Camera
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                checked={cameraSource === "esp32"}
                onChange={() => handleSelectCameraSource("esp32")}
              />
              📶 IP CAMERA
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                checked={cameraSource === "mobile"}
                onChange={() => handleSelectCameraSource("mobile")}
              />
              📱 Mobile Camera (scan QR)
            </label>
          </div>

          {cameraSource === "browser" ? (

            <>
              {cameraErrorMessage && (
                <p style={{ color: "#EF4444", fontSize: 12.5, margin: "0 0 10px", background: "#FEF2F2", padding: "8px 12px", borderRadius: 8, border: "1px solid #FCA5A5" }}>
                  ❌ {cameraErrorMessage}
                </p>
              )}

              <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
                <button
                  onClick={() => setIsCameraActive(!isCameraActive)}
                  style={{ flex: 1, padding: "12px", background: isCameraActive ? "#EF4444" : "#0078D7", color: "white", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer" }}
                >
                  {isCameraActive ? "🛑 Turn off live camera" : "🎥 Turn on camera "}
                </button>

                <label style={{ flex: 1, padding: "12px", background: "#10B981", color: "white", borderRadius: 10, fontWeight: "bold", cursor: "pointer", textAlign: "center" }}>
                  {"📂 Image from PC "}
                  <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
                </label>
              </div>
            </>

          ) : cameraSource === "mobile" ? (

            <div style={{ marginBottom: 15 }}>

              <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <button
                  onClick={handleGenerateMobileQr}
                  style={{
                    flex: 1,
                    padding: "12px",
                    fontSize: 14,
                    fontWeight: "bold",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    background: mobileStatus === "connected" ? "#10B981" : "#0078D7",
                    color: "#fff"
                  }}
                >
                  {mobileSessionId
                    ? (mobileStatus === "connected" ? "✅ Mobile connected (click to generate a new QR)" : "🔄 Generate a new QR Code")
                    : "📱 Generate a QR Code to connect your phone"}
                </button>
              </div>

              {mobileStatus === "waiting" && (
                <p style={{ color: "#D97706", fontSize: 12.5, margin: "0 0 8px" }}>
                  ⏳ Waiting for the phone to scan the QR and open its camera...
                </p>
              )}
              {mobileStatus === "error" && (
                <p style={{ color: "#EF4444", fontSize: 12.5, margin: "0 0 8px" }}>
                  ❌ Connection failed. Please check your network or generate a new QR.
                </p>
              )}
              {mobileStatus === "connected" && (
                <p style={{ color: "#10B981", fontSize: 12.5, margin: "0 0 8px" }}>
                  ✅ Phone connected and sending images
                </p>
              )}

              <label style={{ display: "block", padding: "12px", background: "#10B981", color: "white", borderRadius: 10, fontWeight: "bold", cursor: "pointer", textAlign: "center" }}>
                {"📂 Image from PC "}
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
              </label>

            </div>

          ) : (

            <div style={{ marginBottom: 15 }}>

              <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <input
                  value={esp32IpInput}
                  onChange={(e) => {
                    setEsp32IpInput(e.target.value);
                    setEsp32Status("idle");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConnectEsp32();
                  }}
                  placeholder="192.168.43.181/stream (ESP32-CAM) or 192.168.1.50 (regular IP camera)"
                  style={{ flex: 1, padding: 12, fontSize: 15, borderRadius: 8, border: "1px solid #ccc" }}
                />

                <button
                  onClick={handleConnectEsp32}
                  style={{
                    padding: "0 20px",
                    fontSize: 14,
                    fontWeight: "bold",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: esp32Status === "connected" ? "#10B981" : "#0078D7",
                    color: "#fff",
                    whiteSpace: "nowrap"
                  }}
                >
                  {esp32Status === "connected" ? "✅ Connected" : "🔌 Connect"}
                </button>
              </div>

              {esp32Status === "connecting" && (
                <p style={{ color: "#D97706", fontSize: 12.5, margin: "0 0 8px" }}>⏳ Connecting...</p>
              )}
              {esp32Status === "error" && (
                <p style={{ color: "#EF4444", fontSize: 12.5, margin: "0 0 8px" }}>
                  ❌ Couldn't connect. Please check the IP and network.
                </p>
              )}
              {esp32Status === "connected" && (
                <p style={{ color: "#10B981", fontSize: 12.5, margin: "0 0 8px" }}>
                  ✅ Connected to {esp32IpConnected} successfully
                </p>
              )}

              <label style={{ display: "block", padding: "12px", background: "#10B981", color: "white", borderRadius: 10, fontWeight: "bold", cursor: "pointer", textAlign: "center" }}>
                {"📂 Pull an external image"}
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
              </label>

            </div>

          )}

          <div style={{ width: "100%", height: 380, background: "#000", borderRadius: 12, overflow: "hidden", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>

            {cameraSource === "browser" ? (

              isCameraActive ? (
                <>
                  <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    onClick={captureSnapshot}
                    style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", width: 70, height: 70, borderRadius: "50%", background: "#fff", border: "5px solid #0078D7", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,.3)" }}
                  />
                </>
              ) : (
                <div style={{ color: "#666", textAlign: "center" }}>
                  <p style={{ fontSize: 48, margin: 0 }}>📹</p>
                  <p style={{ color: "#aaa" }}>Click to turn on the camera, or click to upload an image above</p>
                </div>
              )

            ) : cameraSource === "mobile" ? (

              mobileSessionId ? (
                <>
                  <img
                    ref={mobileImgRef}
                    alt="Mobile Camera Stream"
                    crossOrigin="anonymous"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: mobileStatus === "connected" ? "block" : "none"
                    }}
                    onError={() => setMobileStatus("error")}
                  />

                  {mobileStatus === "connected" && (
                    <button
                      onClick={captureSnapshot}
                      style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", width: 70, height: 70, borderRadius: "50%", background: "#fff", border: "5px solid #0078D7", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,.3)" }}
                    />
                  )}

                  {mobileStatus !== "connected" && (
                    <div style={{ textAlign: "center", padding: 16 }}>
                      <img
                        src={mobileQrUrl}
                        alt="QR Code to connect phone"
                        style={{ width: 180, height: 180, borderRadius: 10, background: "#fff", padding: 8 }}
                      />
                      <p style={{ color: "#fff", fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
                        📱 Open your phone's camera and scan the QR (use Google Lens to scan the QR Code)
                      </p>
                      {mobileStatus === "waiting" && (
                        <p style={{ color: "#FBBF24", fontSize: 11.5, marginTop: 4 }}>⏳ Waiting for the phone to connect...</p>
                      )}
                      {mobileStatus === "error" && (
                        <p style={{ color: "#F87171", fontSize: 11.5, marginTop: 4 }}>❌ Connection failed. Try generating a new QR.</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: "#666", textAlign: "center", padding: 20 }}>
                  <p style={{ fontSize: 48, margin: 0 }}>📱</p>
                  <p style={{ color: "#aaa" }}>Click "Generate a QR Code to connect your phone" above, then use your phone (Google Lens to scan the QR Code)</p>
                </div>
              )

            ) : (

              isEsp32StreamShown ? (
                <>
                  <img
                    ref={esp32ImgRef}
                    crossOrigin="anonymous"
                      src={`${esp32IpConnected}${esp32IpConnected.includes("?") ? "&" : "?"}t=${esp32StreamKey}`}
                      alt="Camera Stream"
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onLoad={() => setEsp32Status("connected")}
                    onError={() => {
                      console.log("ESP32 Stream Error");
                      setEsp32Status("error");
                    }}
                  />

                  {esp32Status === "connected" && (
                    <button
                      onClick={captureSnapshot}
                      style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", width: 70, height: 70, borderRadius: "50%", background: "#fff", border: "5px solid #0078D7", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,.3)" }}
                    />
                  )}

                  {esp32Status === "connecting" && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 14 }}>
                      ⏳ Connecting...
                    </div>
                  )}

                  {esp32Status === "error" && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 14, textAlign: "center", padding: 20 }}>
                      ❌ Couldn't connect. Please check the IP and network.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: "#666", textAlign: "center", padding: 20 }}>
                  <p style={{ fontSize: 48, margin: 0 }}>📹</p>
                  <p style={{ color: "#aaa" }}>Enter the IP and click "Connect" before using the camera</p>
                </div>
              )

            )}

          </div>
        </div>

        <div
          style={{
            background: "#fff",
            padding: 20,
            borderRadius: isCanvasFullscreen ? 0 : 15,
            border: "1px solid #E5E7EB",
            boxShadow: "0 4px 12px rgba(0,0,0,.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            ...(isCanvasFullscreen
              ? { position: "fixed", inset: 0, zIndex: 9999, overflowY: "auto" }
              : {})
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 style={{ marginTop: 0, marginBottom: 5 }}>{canvasTitle}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button
                  onClick={() => setIsCanvasFullscreen(v => !v)}
                  title={isCanvasFullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: isCanvasFullscreen ? "#0078D7" : "#F3F4F6",
                    color: isCanvasFullscreen ? "#fff" : "#444",
                    border: isCanvasFullscreen ? "1px solid #0078D7" : "1px solid #d1d5db",
                    borderRadius: 8,
                    padding: "5px 12px",
                    fontSize: 12.5,
                    fontWeight: "bold",
                    cursor: "pointer"
                  }}
                >
                  {isCanvasFullscreen ? "🗗 Exit fullscreen" : "⛶ Fullscreen"}
                </button>
                 
                 <button
               onClick={() => setShowAnnotationGuide(true)}
                 style={{ background: "none", border: "none", color: "#0078D7", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
                        >
                 📖 Annotation tool usage guide
                </button>

                  {capturedImage && (
                    <button
                     onClick={clearWorkspace}
                   style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
                      >
                 🗑️ Discard this image
                    </button>
                    )}


              </div>
            </div>

            {capturedImage && imgNaturalSize.width > 0 && (
              <p style={{ fontSize: 11.5, color: "#0078D7", marginTop: 0, marginBottom: 8 }}>
                📐 Actual size to be saved: {imgNaturalSize.width}×{imgNaturalSize.height}px
              </p>
            )}

            {/* ==========================================================
                🧰 V7/V8: Icon toolbar for choosing the drawing tool (replaces the old radio row)
                The tool currently in use is highlighted with its own background color.
                Each tool's color (dropdown) is shown as a single row below the toolbar,
                only for the tool that's currently selected.
                ========================================================== */}
            <div
              style={{
                display: "inline-flex",
                gap: 6,
                marginBottom: 10,
                padding: 6,
                background: "#F3F4F6",
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                flexWrap: "wrap"
              }}
            >
              <button
                onClick={() => handleAnnotationModeChange("bbox")}
                title="Bounding Box"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: annotationMode === "bbox" ? "#0078D7" : "transparent",
                  filter: annotationMode === "bbox" ? "none" : "grayscale(0.4)",
                  opacity: annotationMode === "bbox" ? 1 : 0.6,
                  transition: "background 0.15s ease"
                }}
              >
                🟧
              </button>
              <button
                onClick={() => handleAnnotationModeChange("polygon")}
                title="Polygon (Segmentation)"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: annotationMode === "polygon" ? "#0078D7" : "transparent",
                  filter: annotationMode === "polygon" ? "none" : "grayscale(0.4)",
                  opacity: annotationMode === "polygon" ? 1 : 0.6,
                  transition: "background 0.15s ease"
                }}
              >
                ⬡
              </button>
              <button
                onClick={() => handleAnnotationModeChange("keypoint")}
                title="Keypoint Detection / Pose Estimation (skeleton)"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isKeypointMode ? "#0EA5E9" : "transparent",
                  filter: isKeypointMode ? "none" : "grayscale(0.4)",
                  opacity: isKeypointMode ? 1 : 0.6,
                  transition: "background 0.15s ease"
                }}
              >
                🦴
              </button>
              <button
                onClick={() => handleAnnotationModeChange("landmark")}
                title="Keypoint / Landmark Detection (face/hand, etc.)"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isLandmarkMode ? "#8B5CF6" : "transparent",
                  filter: isLandmarkMode ? "none" : "grayscale(0.4)",
                  opacity: isLandmarkMode ? 1 : 0.6,
                  transition: "background 0.15s ease"
                }}
              >
                📍
              </button>
              <button
                onClick={() => handleAnnotationModeChange("blur")}
                title="Blur (hide private data)"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isBlurMode ? "#7C3AED" : "transparent",
                  filter: isBlurMode ? "none" : "grayscale(0.4)",
                  opacity: isBlurMode ? 1 : 0.6,
                  transition: "background 0.15s ease"
                }}
              >
                🔒
              </button>
            </div>

            {/* 🎨 Color-selection row — only shows the single row matching whichever tool is
                currently selected (instead of hiding/showing separate dropdowns like before,
                combined into a single spot that matches the toolbar above, easier to read) */}
            {annotationMode === "bbox" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5, color: "#0078D7" }}>
                🎨 Box color (Bounding Box):
                <select
                  value={boxColorChoice}
                  onChange={(e) => setBoxColorChoice(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 12.5,
                    borderRadius: 6,
                    border: "1px solid #BFDBFE",
                    background: "#EFF6FF",
                    color: "#374151",
                    cursor: "pointer"
                  }}
                >
                  {SHAPE_COLOR_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}

            {annotationMode === "polygon" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5, color: "#0078D7" }}>
                🎨 Polygon color:
                <select
                  value={polygonColorChoice}
                  onChange={(e) => setPolygonColorChoice(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 12.5,
                    borderRadius: 6,
                    border: "1px solid #BFDBFE",
                    background: "#EFF6FF",
                    color: "#374151",
                    cursor: "pointer"
                  }}
                >
                  {SHAPE_COLOR_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}

            {isKeypointMode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5, color: "#0EA5E9", flexWrap: "wrap" }}>
                🎨 Skeleton color (Pose):
                <select
                  value={poseColorChoice}
                  onChange={(e) => setPoseColorChoice(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 12.5,
                    borderRadius: 6,
                    border: "1px solid #BAE6FD",
                    background: "#F0F9FF",
                    color: "#374151",
                    cursor: "pointer"
                  }}
                >
                  {SHAPE_COLOR_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <span style={{ color: "#94A3B8", fontSize: 11.5 }}>
                  Point {currentPoseKeypoints.length}/{POSE_TEMPLATE.names.length}
                  {currentPoseKeypoints.length > 0 && ` (next: ${POSE_TEMPLATE.names[currentPoseKeypoints.length]})`}
                </span>
              </div>
            )}

            {isLandmarkMode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5, color: "#8B5CF6", flexWrap: "wrap" }}>
                🎨 Landmark color:
                <select
                  value={landmarkColorChoice}
                  onChange={(e) => setLandmarkColorChoice(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 12.5,
                    borderRadius: 6,
                    border: "1px solid #DDD6FE",
                    background: "#F5F3FF",
                    color: "#374151",
                    cursor: "pointer"
                  }}
                >
                  {SHAPE_COLOR_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <span style={{ marginLeft: 6 }}>Type:</span>
                <select
                  value={landmarkTemplateChoice}
                  onChange={(e) => {
                    if (currentLandmarkPoints.length > 0) {
                      const confirmed = window.confirm("There are unfinished points. Changing the type will discard them. Do you want to continue?");
                      if (!confirmed) return;
                      setCurrentLandmarkPoints([]);
                    }
                    setLandmarkTemplateChoice(e.target.value);
                  }}
                  style={{
                    padding: "4px 8px",
                    fontSize: 12.5,
                    borderRadius: 6,
                    border: "1px solid #DDD6FE",
                    background: "#F5F3FF",
                    color: "#374151",
                    cursor: "pointer"
                  }}
                >
                  {Object.entries(LANDMARK_TEMPLATES).map(([key, tpl]) => (
                    <option key={key} value={key}>{tpl.label}</option>
                  ))}
                </select>
                <span style={{ color: "#94A3B8", fontSize: 11.5 }}>
                  Point {currentLandmarkPoints.length}/{LANDMARK_TEMPLATES[landmarkTemplateChoice].names.length}
                  {currentLandmarkPoints.length > 0 && ` (next: ${LANDMARK_TEMPLATES[landmarkTemplateChoice].names[currentLandmarkPoints.length]})`}
                </span>
              </div>
            )}

            {isBlurMode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5, color: "#7C3AED" }}>
                🎨 Blur box color:
                <select
                  value={blurColor}
                  onChange={(e) => setBlurColor(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    fontSize: 12.5,
                    borderRadius: 6,
                    border: "1px solid #DDD6FE",
                    background: "#F5F3FF",
                    color: "#374151",
                    cursor: "pointer"
                  }}
                >
                  {COLOR_PICKER_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}

            <p style={{ fontSize: 13, color: "#666", marginTop: 0, marginBottom: 8 }}>
              {isSegmentation
                ? "Click to add boundary points one by one, then click the first point again (or press the ✅ Close Shape button) to close the Polygon — drag an existing point to reposition it — click on the edge of a closed Polygon to insert a new point there"
                : isBlurMode
                  ? "Click and drag a box over the area you want to blur (e.g. a person's face, license plate, document) — when you save, the actual image will be permanently blurred at the pixel level and cannot be recovered"
                  : isKeypointMode
                    ? "Click to place points in the order the system indicates (nose → eyes → ears → shoulders → elbows → wrists → hips → knees → ankles). The system automatically draws skeleton lines connecting the points; once all 17 points are placed the pose closes automatically — drag an existing point to reposition it"
                    : isLandmarkMode
                      ? "Choose a type (face/hand), then click to place points in the order the system indicates. The system automatically draws connecting lines based on the selected template — drag an existing point to reposition it"
                      : "Click and drag to draw a rectangle around the object you want to detect"}
            </p>
            {capturedImage && augMode !== "original" && (
              <p style={{ fontSize: 12, color: "#d73900", marginTop: 0, marginBottom: 8 }}>
                * You must select 📦 Original to be able to use the drawing tools
              </p>
            )}

            <div style={{ position: "relative" }}>
              <div
                ref={imageContainerRef}
                onMouseDown={handleContainerMouseDown}
                onMouseMove={handleContainerMouseMove}
                onMouseUp={handleContainerMouseUp}
                onMouseLeave={() => {
                  if (!editingHandle) setHoverCursor(null);
                  if (isPanning) setIsPanning(false);
                  if (draggingVertex) setDraggingVertex(null);
                  if (draggingPolygonMove) setDraggingPolygonMove(null);
                  if (draggingBoxLabel) setDraggingBoxLabel(null);
                  if (draggingPolygonLabelState) setDraggingPolygonLabelState(null);
                  if (draggingPoseVertex) setDraggingPoseVertex(null);
                  if (draggingLandmarkVertex) setDraggingLandmarkVertex(null);
                  hoveredLabelRef.current = null;
                  hoveredPolygonVertexRef.current = null; // 🆕
                }}
                onClick={handleContainerClick}
                onContextMenu={handleContainerContextMenu}
                style={{
                  width: "100%",
                  height: CANVAS_HEIGHT,
                  background: "#F3F4F6",
                  borderRadius: 12,
                  overflow: "hidden",
                  position: "relative",
                  cursor: !capturedImage
                    ? "not-allowed"
                    : isPanning
                      ? "grabbing"
                      : augMode !== "original"
                        ? "default"
                        : isSegmentation
                          ? ((draggingVertex || draggingPolygonMove || draggingPolygonLabelState) ? "grabbing" : (hoverCursor || "crosshair"))
                          : isKeypointMode
                            ? (draggingPoseVertex ? "grabbing" : (hoverCursor || "crosshair"))
                            : isLandmarkMode
                              ? (draggingLandmarkVertex ? "grabbing" : (hoverCursor || "crosshair"))
                              : (draggingBoxLabel ? "grabbing" : (editingHandle ? getCursorForHandleType(editingHandle.type) : (hoverCursor || "crosshair"))),
                  userSelect: "none"
                }}
              >
              {capturedImage ? (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    transform: getCombinedTransform(),
                    transformOrigin: "center center",
                    transition: "transform 0.3s ease"
                  }}
                >
                  <img
                    src={capturedImage}
                    alt="Workspace"
                    onLoad={(e) => setImgNaturalSize({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      pointerEvents: "none",
                      filter: getPreviewFilter(),
                      transition: "filter 0.3s ease"
                    }}
                  />

                  <svg
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                  >
                    {polygons.map((poly) => {
                      const polyColor = poly.colorOverride || getColorForLabel(poly.label); // 🎨 V4/V6: a manually chosen color takes priority, otherwise use the label-based color
                      return (
                      <g key={poly.id}>
                        <polygon
                          points={poly.points.map(p => `${p.x},${p.y}`).join(" ")}
                          fill={`rgba(${hexToRgbString(polyColor)}, 0.18)`}
                          stroke={polyColor}
                          strokeWidth="2"
                        />
                        {poly.points.map((p, i) => {
                          const isBeingDragged = draggingVertex && draggingVertex.polygonId === poly.id && draggingVertex.pointIndex === i;
                          return (
                            <circle
                              key={i}
                              cx={p.x}
                              cy={p.y}
                              r={isBeingDragged ? 6 : 4}
                              fill={isBeingDragged ? "#0078D7" : polyColor}
                              stroke="#fff"
                              strokeWidth="1.5"
                            />
                          );
                        })}
                        {poly.points[0] && (
                          <foreignObject
                            x={poly.points[0].x + (poly.labelOffset?.x || 0)}
                            y={Math.max(0, poly.points[0].y - 26 + (poly.labelOffset?.y || 0))}
                            width="150"
                            height={editingPolygonLabelId === poly.id ? "170" : "24"}
                            style={{ overflow: "visible", pointerEvents: "auto" }}
                          >
                            {editingPolygonLabelId === poly.id ? (
                              <div style={{ position: "relative" }}>
                                <input
                                  type="text"
                                  autoFocus
                                  value={poly.label}
                                  onChange={(e) => handlePolygonLabelChange(poly.id, e.target.value)}
                                  onBlur={() => { registerClassName(poly.label); setEditingPolygonLabelId(null); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") { registerClassName(poly.label); setEditingPolygonLabelId(null); } }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ fontSize: 11, fontWeight: "bold", padding: "2px 6px", border: `1px solid ${polyColor}`, borderRadius: 4, width: 110, color: polyColor }}
                                />
                                {(() => {
                                  const currentValue = poly.label.trim().toLowerCase();
                                  const suggestions = knownClasses.filter(c => c.toLowerCase() !== currentValue);
                                  return suggestions.length > 0 && (
                                    <div
                                      style={{
                                        position: "absolute", top: "100%", left: 0, marginTop: 2,
                                        background: "#fff", border: `1px solid ${polyColor}`, borderRadius: 6,
                                        boxShadow: "0 4px 10px rgba(0,0,0,.15)", maxHeight: 140, overflowY: "auto",
                                        width: 140, zIndex: 30
                                      }}
                                    >
                                      {suggestions.map((c) => (
                                        <div
                                          key={c}
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handlePolygonLabelChange(poly.id, c);
                                            registerClassName(c);
                                            setEditingPolygonLabelId(null);
                                          }}
                                          style={{ padding: "5px 8px", fontSize: 12, cursor: "pointer", color: "#333" }}
                                          onMouseEnter={(e) => { e.currentTarget.style.background = "#FEF3E8"; }}
                                          onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                                        >
                                          {c}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : (
                              <span
                                onMouseDown={(e) => {
                                  if (e.ctrlKey || e.metaKey) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    suppressLabelClickRef.current = true;
                                    setDraggingPolygonLabelState({
                                      polygonId: poly.id,
                                      startPos: getMousePos(e),
                                      originalOffset: poly.labelOffset || { x: 0, y: 0 }
                                    });
                                  } else {
                                    e.stopPropagation();
                                  }
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (suppressLabelClickRef.current) {
                                    suppressLabelClickRef.current = false;
                                    return;
                                  }
                                  pushHistory();
                                  setEditingPolygonLabelId(poly.id);
                                }}
                                onMouseEnter={() => { hoveredLabelRef.current = { type: "polygon", id: poly.id }; }}
                                onMouseLeave={() => {
                                  if (hoveredLabelRef.current?.type === "polygon" && hoveredLabelRef.current.id === poly.id) {
                                    hoveredLabelRef.current = null;
                                  }
                                }}
                                title="Click to edit the label — Ctrl+drag: move just the label — Ctrl+C copy / Ctrl+V paste"
                                style={{ display: "inline-block", background: polyColor, color: "#fff", fontSize: 11, fontWeight: "bold", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", cursor: "pointer" }}
                              >
                                {poly.label}
                              </span>
                            )}
                          </foreignObject>
                        )}
                      </g>
                      );
                    })}

                    {currentPolygonPoints.length > 0 && (
                      <g>
                        <polyline
                          points={[...currentPolygonPoints, ...(hoverPoint ? [hoverPoint] : [])]
                            .map(p => `${p.x},${p.y}`).join(" ")}
                          fill="none"
                          stroke="#0078D7"
                          strokeWidth="2"
                          strokeDasharray="5,4"
                        />
                        {currentPolygonPoints.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={i === 0 ? 6 : 4}
                            fill={i === 0 ? "#10B981" : "#0078D7"}
                            stroke="#fff"
                            strokeWidth="1.5"
                          />
                        ))}
                      </g>
                    )}

                    {/* 🦴 V8: draw all fully-closed Pose skeletons — connecting lines from POSE_TEMPLATE.connections first, then draw points on top */}
                    {poses.map((pose) => {
                      const poseColor = pose.colorOverride || POSE_LINE_COLOR;
                      const pointColor = pose.colorOverride || POSE_POINT_COLOR;
                      return (
                        <g key={pose.id}>
                          {POSE_TEMPLATE.connections.map(([a, b], idx) => {
                            const pa = pose.keypoints[a];
                            const pb = pose.keypoints[b];
                            if (!pa || !pb || pa.visible === false || pb.visible === false) return null;
                            return (
                              <line
                                key={idx}
                                x1={pa.x} y1={pa.y}
                                x2={pb.x} y2={pb.y}
                                stroke={poseColor}
                                strokeWidth="2.5"
                              />
                            );
                          })}
                          {pose.keypoints.map((p, i) => {
                            const isBeingDragged = draggingPoseVertex && draggingPoseVertex.poseId === pose.id && draggingPoseVertex.pointIndex === i;
                            return (
                              <circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                r={isBeingDragged ? 6.5 : 5}
                                fill={isBeingDragged ? "#0078D7" : pointColor}
                                stroke="#fff"
                                strokeWidth="1.5"
                              />
                            );
                          })}
                          {pose.keypoints[0] && (
                            <foreignObject
                              x={pose.keypoints[0].x - 20}
                              y={Math.max(0, pose.keypoints[0].y - 42)}
                              width="150"
                              height={editingPoseLabelId === pose.id ? "40" : "24"}
                              style={{ overflow: "visible", pointerEvents: "auto" }}
                            >
                              {editingPoseLabelId === pose.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={pose.label}
                                  onChange={(e) => handlePoseLabelChange(pose.id, e.target.value)}
                                  onBlur={() => setEditingPoseLabelId(null)}
                                  onKeyDown={(e) => { if (e.key === "Enter") setEditingPoseLabelId(null); }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ fontSize: 11, fontWeight: "bold", padding: "2px 6px", border: `1px solid ${poseColor}`, borderRadius: 4, width: 100, color: poseColor }}
                                />
                              ) : (
                                <span
                                  onClick={(e) => { e.stopPropagation(); pushHistory(); setEditingPoseLabelId(pose.id); }}
                                  title="Click to edit the label — right-click any point: delete this whole pose"
                                  style={{ display: "inline-block", background: poseColor, color: "#fff", fontSize: 11, fontWeight: "bold", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", cursor: "pointer" }}
                                >
                                  🦴 {pose.label}
                                </span>
                              )}
                            </foreignObject>
                          )}
                        </g>
                      );
                    })}

                    {/* 🦴 V8: a pose that's currently mid-drawing (not yet complete) — dashed connecting lines for what's placed so far + preview the next point on hover */}
                    {currentPoseKeypoints.length > 0 && (
                      <g>
                        {POSE_TEMPLATE.connections.map(([a, b], idx) => {
                          const pa = currentPoseKeypoints[a];
                          const pb = currentPoseKeypoints[b];
                          if (!pa || !pb) return null;
                          return (
                            <line
                              key={idx}
                              x1={pa.x} y1={pa.y}
                              x2={pb.x} y2={pb.y}
                              stroke={POSE_LINE_COLOR}
                              strokeWidth="2"
                              strokeDasharray="4,3"
                            />
                          );
                        })}
                        {currentPoseKeypoints.map((p, i) => (
                          <circle key={i} cx={p.x} cy={p.y} r={5} fill={POSE_POINT_COLOR} stroke="#fff" strokeWidth="1.5" />
                        ))}
                      </g>
                    )}

                    {/* 📍 V8: draw all fully-closed Landmarks — connecting lines from template.connections first, then draw points on top */}
                    {landmarks.map((lm) => {
                      const template = LANDMARK_TEMPLATES[lm.templateType] || LANDMARK_TEMPLATES.face;
                      const lineColor = lm.colorOverride || LANDMARK_LINE_COLOR;
                      const pointColor = lm.colorOverride || LANDMARK_POINT_COLOR;
                      return (
                        <g key={lm.id}>
                          {template.connections.map(([a, b], idx) => {
                            const pa = lm.points[a];
                            const pb = lm.points[b];
                            if (!pa || !pb) return null;
                            return (
                              <line
                                key={idx}
                                x1={pa.x} y1={pa.y}
                                x2={pb.x} y2={pb.y}
                                stroke={lineColor}
                                strokeWidth="2"
                              />
                            );
                          })}
                          {lm.points.map((p, i) => {
                            const isBeingDragged = draggingLandmarkVertex && draggingLandmarkVertex.landmarkId === lm.id && draggingLandmarkVertex.pointIndex === i;
                            return (
                              <circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                r={isBeingDragged ? 6 : 4}
                                fill={isBeingDragged ? "#0078D7" : pointColor}
                                stroke="#fff"
                                strokeWidth="1.5"
                              />
                            );
                          })}
                          {lm.points[0] && (
                            <foreignObject
                              x={lm.points[0].x - 20}
                              y={Math.max(0, lm.points[0].y - 36)}
                              width="150"
                              height={editingLandmarkLabelId === lm.id ? "40" : "24"}
                              style={{ overflow: "visible", pointerEvents: "auto" }}
                            >
                              {editingLandmarkLabelId === lm.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={lm.label}
                                  onChange={(e) => handleLandmarkLabelChange(lm.id, e.target.value)}
                                  onBlur={() => setEditingLandmarkLabelId(null)}
                                  onKeyDown={(e) => { if (e.key === "Enter") setEditingLandmarkLabelId(null); }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ fontSize: 11, fontWeight: "bold", padding: "2px 6px", border: `1px solid ${lineColor}`, borderRadius: 4, width: 100, color: lineColor }}
                                />
                              ) : (
                                <span
                                  onClick={(e) => { e.stopPropagation(); pushHistory(); setEditingLandmarkLabelId(lm.id); }}
                                  title="Click to edit the label — right-click any point: delete this whole landmark"
                                  style={{ display: "inline-block", background: lineColor, color: "#fff", fontSize: 11, fontWeight: "bold", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", cursor: "pointer" }}
                                >
                                  📍 {lm.label}
                                </span>
                              )}
                            </foreignObject>
                          )}
                        </g>
                      );
                    })}

                    {/* 📍 V8: a landmark that's currently mid-drawing (not yet complete) */}
                    {currentLandmarkPoints.length > 0 && (
                      <g>
                        {LANDMARK_TEMPLATES[landmarkTemplateChoice].connections.map(([a, b], idx) => {
                          const pa = currentLandmarkPoints[a];
                          const pb = currentLandmarkPoints[b];
                          if (!pa || !pb) return null;
                          return (
                            <line
                              key={idx}
                              x1={pa.x} y1={pa.y}
                              x2={pb.x} y2={pb.y}
                              stroke={LANDMARK_LINE_COLOR}
                              strokeWidth="2"
                              strokeDasharray="4,3"
                            />
                          );
                        })}
                        {currentLandmarkPoints.map((p, i) => (
                          <circle key={i} cx={p.x} cy={p.y} r={4} fill={LANDMARK_POINT_COLOR} stroke="#fff" strokeWidth="1.5" />
                        ))}
                      </g>
                    )}
                  </svg>

                  {boxes.map((box) => {
                    const boxColor = box.colorOverride || getColorForLabel(box.label); // 🎨 V4/V6: a manually chosen color takes priority, otherwise use the label-based color
                    return (
                    <div
                      key={box.id}
                      style={{
                        position: "absolute",
                        left: box.x,
                        top: box.y,
                        width: box.w,
                        height: box.h,
                        border: `2px solid ${boxColor}`,
                        background: `rgba(${hexToRgbString(boxColor)}, 0.15)`,
                        pointerEvents: "none"
                      }}
                    >
                      {editingBoxLabelId === box.id ? (
                        <div style={{ position: "absolute", top: -24 + (box.labelOffset?.y || 0), left: -2 + (box.labelOffset?.x || 0), zIndex: 25, pointerEvents: "auto" }}>
                          <input
                            type="text"
                            autoFocus
                            value={box.label}
                            onChange={(e) => handleLabelChange(box.id, e.target.value)}
                            onBlur={() => { registerClassName(box.label); setEditingBoxLabelId(null); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { registerClassName(box.label); setEditingBoxLabelId(null); } }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 11, fontWeight: "bold", padding: "2px 6px", border: `1px solid ${boxColor}`, borderRadius: 4, width: 100, color: boxColor, pointerEvents: "auto" }}
                          />
                          {(() => {
                            const currentValue = box.label.trim().toLowerCase();
                            const suggestions = knownClasses.filter(c => c.toLowerCase() !== currentValue);
                            return suggestions.length > 0 && (
                              <div
                                style={{
                                  position: "absolute", top: "100%", left: 0, marginTop: 2,
                                  background: "#fff", border: `1px solid ${boxColor}`, borderRadius: 6,
                                  boxShadow: "0 4px 10px rgba(0,0,0,.15)", maxHeight: 140, overflowY: "auto",
                                  width: 140, zIndex: 30, pointerEvents: "auto"
                                }}
                              >
                                {suggestions.map((c) => (
                                  <div
                                    key={c}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleLabelChange(box.id, c);
                                      registerClassName(c);
                                      setEditingBoxLabelId(null);
                                    }}
                                    style={{ padding: "5px 8px", fontSize: 12, cursor: "pointer", color: "#333" }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "#FEF3E8"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                                  >
                                    {c}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <span
                          onMouseDown={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              e.preventDefault();
                              e.stopPropagation();
                              suppressLabelClickRef.current = true;
                              setDraggingBoxLabel({
                                boxId: box.id,
                                startPos: getMousePos(e),
                                originalOffset: box.labelOffset || { x: 0, y: 0 }
                              });
                            } else {
                              e.stopPropagation();
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (suppressLabelClickRef.current) {
                              suppressLabelClickRef.current = false;
                              return;
                            }
                            pushHistory();
                            setEditingBoxLabelId(box.id);
                          }}
                          onMouseEnter={() => { hoveredLabelRef.current = { type: "box", id: box.id }; }}
                          onMouseLeave={() => {
                            if (hoveredLabelRef.current?.type === "box" && hoveredLabelRef.current.id === box.id) {
                              hoveredLabelRef.current = null;
                            }
                          }}
                          title="Click to edit the label — Ctrl+drag: move just the label — Ctrl+C copy / Ctrl+V paste"
                          style={{ position: "absolute", top: -22 + (box.labelOffset?.y || 0), left: -2 + (box.labelOffset?.x || 0), background: boxColor, color: "#fff", fontSize: 11, padding: "2px 6px", borderRadius: "4px 4px 0 0", whiteSpace: "nowrap", cursor: "pointer", pointerEvents: "auto" }}
                        >
                          {box.label}
                        </span>
                      )}
                    </div>
                    );
                  })}

                  {currentBox && (
                    <div
                      style={{
                        position: "absolute",
                        left: currentBox.x,
                        top: currentBox.y,
                        width: currentBox.w,
                        height: currentBox.h,
                        border: "2px dashed #0078D7",
                        background: "rgba(0, 120, 215, 0.1)",
                        pointerEvents: "none"
                      }}
                    />
                  )}

                  {/* 🔒 V3/V5: already-drawn Blur regions — shows a realistic blur preview via CSS
                      backdrop-filter; the color of each box uses the value chosen at drawing time
                      (region.color), with older shapes falling back to purple as before.
                      (the actual result on save is a permanent pixelation, not just this CSS filter) */}
                  {blurRegions.map((region) => {
                    const regionColor = region.color || DEFAULT_BLUR_COLOR;
                    return (
                    <div
                      key={region.id}
                      style={{
                        position: "absolute",
                        left: region.x,
                        top: region.y,
                        width: region.w,
                        height: region.h,
                        backdropFilter: "blur(6px)",
                        WebkitBackdropFilter: "blur(6px)",
                        background: `rgba(${hexToRgbStringForBlur(regionColor)}, 0.12)`,
                        border: `2px dashed ${regionColor}`,
                        borderRadius: 4,
                        pointerEvents: "none"
                      }}
                    >
                      <span
                        style={{
                          position: "absolute", top: -20, left: -2,
                          background: regionColor, color: "#fff", fontSize: 10, fontWeight: "bold",
                          padding: "2px 6px", borderRadius: "4px 4px 0 0", whiteSpace: "nowrap"
                        }}
                      >
                        🔒 Blur
                      </span>
                    </div>
                    );
                  })}

                  {/* 🔒 V3/V5: the blur box currently being drag-drawn (preview while dragging), using the color currently selected in the dropdown */}
                  {currentBlurBox && (
                    <div
                      style={{
                        position: "absolute",
                        left: currentBlurBox.x,
                        top: currentBlurBox.y,
                        width: currentBlurBox.w,
                        height: currentBlurBox.h,
                        backdropFilter: "blur(6px)",
                        WebkitBackdropFilter: "blur(6px)",
                        background: `rgba(${hexToRgbStringForBlur(blurColor)}, 0.15)`,
                        border: `2px dashed ${blurColor}`,
                        pointerEvents: "none"
                      }}
                    />
                  )}
                </div>
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>
                  No image yet (please capture a photo or click to upload an image from the left first)
                </div>
              )}
              </div>

              {capturedImage && zoomLevel > 1 && (
                <div style={{ position: "absolute", top: 0, right: 4, width: 22, height: CANVAS_HEIGHT, pointerEvents: "none" }}>
                  <input
                    type="range"
                    min={-getPanBounds().maxY}
                    max={getPanBounds().maxY}
                    step="1"
                    value={panOffset.y}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPanOffset(prev => clampPanOffset({ ...prev, y: v }));
                    }}
                    title="Pan the image up-down"
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      width: CANVAS_HEIGHT,
                      height: 20,
                      transform: "translate(-50%, -50%) rotate(-90deg)",
                      transformOrigin: "center center",
                      cursor: "pointer",
                      accentColor: "#0078D7",
                      margin: 0,
                      pointerEvents: "auto"
                    }}
                  />
                </div>
              )}
            </div>

            {capturedImage && zoomLevel > 1 && (
              <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                <input
                  type="range"
                  min={-getPanBounds().maxX}
                  max={getPanBounds().maxX}
                  step="1"
                  value={-panOffset.x}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPanOffset(prev => clampPanOffset({ ...prev, x: -v }));
                  }}
                  title="Pan the image left-right"
                  style={{ flex: 1, cursor: "pointer", accentColor: "#0078D7" }}
                />
              </div>
            )}

            {isSegmentation && capturedImage && augMode === "original" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={finishPolygon}
                  disabled={currentPolygonPoints.length < 3}
                  style={{ padding: "6px 14px", background: currentPolygonPoints.length < 3 ? "#ccc" : "#10B981", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: "bold", cursor: currentPolygonPoints.length < 3 ? "not-allowed" : "pointer" }}
                >
                  ✅ Close Polygon shape ({currentPolygonPoints.length} points)
                </button>
                <button
                  onClick={undoLastPolygonPoint}
                  disabled={currentPolygonPoints.length === 0}
                  style={{ padding: "6px 14px", background: "#F3F4F6", color: "#444", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, cursor: currentPolygonPoints.length === 0 ? "not-allowed" : "pointer" }}
                >
                  ↩️ Undo last point (press r)
                </button>
                <button
                  onClick={cancelCurrentPolygon}
                  disabled={currentPolygonPoints.length === 0}
                  style={{ padding: "6px 14px", background: "#FEF2F2", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 8, fontSize: 13, cursor: currentPolygonPoints.length === 0 ? "not-allowed" : "pointer" }}
                >
                  🗑️ Cancel this Polygon (Esc)
                </button>
              </div>
            )}

            {isKeypointMode && capturedImage && augMode === "original" && currentPoseKeypoints.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={finishPoseNow}
                  style={{ padding: "6px 14px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: "bold", cursor: "pointer" }}
                >
                  ✅ Close this Pose now ({currentPoseKeypoints.length}/{POSE_TEMPLATE.names.length} points)
                </button>
                <button
                  onClick={undoLastPoseKeypoint}
                  style={{ padding: "6px 14px", background: "#F3F4F6", color: "#444", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                >
                  ↩️ Undo last point (press r)
                </button>
                <button
                  onClick={cancelCurrentPose}
                  style={{ padding: "6px 14px", background: "#FEF2F2", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                >
                  🗑️ Cancel this Pose (Esc)
                </button>
              </div>
            )}

            {isLandmarkMode && capturedImage && augMode === "original" && currentLandmarkPoints.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={finishLandmarkNow}
                  style={{ padding: "6px 14px", background: "#10B981", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: "bold", cursor: "pointer" }}
                >
                  ✅ Close this Landmark now ({currentLandmarkPoints.length}/{LANDMARK_TEMPLATES[landmarkTemplateChoice].names.length} points)
                </button>
                <button
                  onClick={undoLastLandmarkPoint}
                  style={{ padding: "6px 14px", background: "#F3F4F6", color: "#444", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                >
                  ↩️ Undo last point (press r)
                </button>
                <button
                  onClick={cancelCurrentLandmark}
                  style={{ padding: "6px 14px", background: "#FEF2F2", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                >
                  🗑️ Cancel this Landmark (Esc)
                </button>
              </div>
            )}

            {capturedImage && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "#475569", flexWrap: "wrap" }}>
                <span style={{ minWidth: 62 }}>🔍 Zoom: {Math.round(zoomLevel * 100)}%</span>
                <button
                  onClick={() => setZoomLevel(z => {
                    const next = Math.max(MIN_ZOOM, Number((z - 0.25).toFixed(2)));
                    setPanOffset(prev => clampPanOffset(prev, next));
                    return next;
                  })}
                  disabled={zoomLevel <= MIN_ZOOM}
                  style={{ width: 26, height: 26, flexShrink: 0, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: zoomLevel <= MIN_ZOOM ? "not-allowed" : "pointer", color: "#444" }}
                >−</button>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step="0.05"
                  value={zoomLevel}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setZoomLevel(next);
                    setPanOffset(prev => clampPanOffset(prev, next));
                  }}
                  style={{ flex: 1, maxWidth: 160, cursor: "pointer", accentColor: "#0078D7" }}
                />
                <button
                  onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                  disabled={zoomLevel === 1}
                  style={{ padding: "2px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: zoomLevel === 1 ? "not-allowed" : "pointer", color: "#444", fontSize: 11 }}
                >Reset</button>
                <button
                  onClick={() => setZoomLevel(z => {
                    const next = Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2)));
                    setPanOffset(prev => clampPanOffset(prev, next));
                    return next;
                  })}
                  disabled={zoomLevel >= MAX_ZOOM}
                  style={{ width: 26, height: 26, flexShrink: 0, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: zoomLevel >= MAX_ZOOM ? "not-allowed" : "pointer", color: "#444" }}
                >+</button>
                </div>
            )}

            
          </div>

          {capturedImage && (
            <div style={{ marginTop: 15, background: "#F8FAFC", padding: 12, borderRadius: 10, border: "1px solid #E2E8F0" }}>
              <div style={{ fontWeight: "bold", color: "#475569", fontSize: 14, marginBottom: 10 }}>
                🖼️ Preview of what will be saved (click an image to select a mode, then see the result on the Canvas to the right)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
                {AUGMENTATION_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => handleAugModeChange(m.value)}
                    title={m.label}
                    style={{
                      position: "relative",
                      padding: 0,
                      border: augMode === m.value ? "3px solid #0078D7" : "2px solid #E5E7EB",
                      borderRadius: 10,
                      overflow: "hidden",
                      cursor: "pointer",
                      background: "#000",
                      aspectRatio: "1 / 1"
                    }}
                  >
                    <img
                      src={capturedImage}
                      alt={m.label}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        transform: getTransformForMode(m.value),
                        filter: getCanvasFilter(m.value)
                      }}
                    />
                    {allModesSaved && (
                      <span
                        style={{
                          position: "absolute", top: 4, right: 4,
                          background: "#10B981", color: "#fff", borderRadius: "50%",
                          width: 18, height: 18, display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: 11, fontWeight: "bold"
                        }}
                      >
                        ✓
                      </span>
                    )}
                    <span
                      style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 10,
                        padding: "3px 4px", textAlign: "center", whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis"
                      }}
                    >
                      {m.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      <div style={{ background: status.bg, border: `1px solid ${status.color}`, padding: "15px 20px", borderRadius: 12, marginBottom: 25 }}>
        <div style={{ fontWeight: "bold", color: status.color, fontSize: 15, marginBottom: 8 }}>
          {status.text}
        </div>
        <div style={{ width: "100%", height: 10, background: "#E2E8F0", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ width: `${status.percent}%`, height: "100%", background: status.color, borderRadius: 5, transition: "width 0.5s ease" }} />
        </div>
      </div>

      <div style={{ background: "#fff", padding: 20, borderRadius: 15, border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
          <h3 style={{ margin: 0 }}>
            📊 Annotations on this image ({boxes.length} box(es), {polygons.length} polygon(s), {poses.length} pose(s), {landmarks.length} landmark(s), {blurRegions.length} blur)
          </h3>
          <button
            disabled={saveDisabled}
            style={{ padding: "10px 20px", background: saveDisabled ? "#ccc" : "#0078D7", color: "white", border: "none", borderRadius: 8, fontWeight: "bold", cursor: saveDisabled ? "not-allowed" : "pointer" }}
            onClick={saveAllModesToDataset}
            title={allModesSaved ? "This image has already been saved in all 12 variants. Please capture/upload a new image first." : ""}
          >
            {allModesSaved ? "✅ All 12 variants saved" : (isSubmitting ? "⌛ Generating all 12 variants..." : "💾 Save Image (auto-generates all 12 variants)")}
          </button>
        </div>

        {blurRegions.length > 0 && (
          <p style={{ fontSize: 12, color: "#7C3AED", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 8, padding: "8px 12px", margin: "0 0 15px" }}>
            🔒 There are {blurRegions.length} blur area(s) that will be permanently blurred to actual pixels when you save
          </p>
        )}

        {loadingGallery ? (
          <p style={{ color: "#94A3B8", fontSize: 12.5, margin: "0 0 12px" }}>⏳ Loading gallery...</p>
        ) : projectGallery.length > 0 ? (
          <div style={{ marginBottom: 15 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: "bold", color: "#475569" }}>
                🖼️ Saved image library for this project ({projectGallery.length} most recent)
              </span>
              <button
                onClick={fetchProjectGallery}
                style={{ background: "none", border: "none", color: "#0078D7", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
              >
                🔄 Refresh
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {projectGallery.map((img) => (
                <a
                  key={img.id}
                  href={img.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={img.aug_mode}
                  style={{ position: "relative", display: "block", aspectRatio: "1 / 1", borderRadius: 6, overflow: "hidden", border: "1px solid #E5E7EB" }}
                >
                  <img
                    src={img.image_url}
                    alt={img.aug_mode}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  <span
                    style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 9,
                      padding: "2px 3px", textAlign: "center", whiteSpace: "nowrap",
                      overflow: "hidden", textOverflow: "ellipsis"
                    }}
                  >
                    {img.aug_mode}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {boxes.length === 0 && polygons.length === 0 && blurRegions.length === 0 && poses.length === 0 && landmarks.length === 0 ? (
          <p style={{ color: "#aaa", textAlign: "center", padding: "10px 0" }}>No Bounding Box, Polygon, Pose, Landmark, or Blur region has been drawn on the current image yet</p>
        ) : (
          <>
            {boxes.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: "#666", margin: "0 0 10px" }}>🟧 Bounding Box ({boxes.length})</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: (polygons.length > 0 || blurRegions.length > 0 || poses.length > 0 || landmarks.length > 0) ? 20 : 0 }}>
                  {boxes.map((box, index) => {
                    const boxColor = box.colorOverride || getColorForLabel(box.label); // 🎨 V4/V6: a manually chosen color takes priority (matches what's shown on the canvas)
                    return (
                    <div key={box.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", padding: "12px 15px", borderRadius: 8 }}>
                      <div>
                        <strong style={{ color: "#666", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: boxColor }} />
                          Box #{index + 1}
                        </strong>
                        <div style={{ marginTop: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: "#444" }}>Class:</span>
                          <input
                            type="text"
                            list="class-suggestions"
                            value={box.label}
                            onChange={(e) => handleLabelChange(box.id, e.target.value)}
                            onBlur={() => registerClassName(box.label)}
                            style={{ marginLeft: 8, padding: "3px 8px", border: "1px solid #cbd5e1", borderRadius: 5, fontWeight: "bold", color: boxColor, width: "120px" }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: "#888" }}>
                          X: {Math.round(box.x)} | Y: {Math.round(box.y)} | W: {Math.round(box.w)} | H: {Math.round(box.h)}
                        </div>
                      </div>
                      <button onClick={() => deleteBox(box.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: 5 }} title="Delete this box">❌</button>
                    </div>
                    );
                  })}
                </div>
              </>
            )}

            {polygons.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: "#666", margin: "0 0 10px" }}>⬡ Polygon ({polygons.length})</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: (blurRegions.length > 0 || poses.length > 0 || landmarks.length > 0) ? 20 : 0 }}>
                  {polygons.map((poly, index) => {
                    const polyColor = poly.colorOverride || getColorForLabel(poly.label); // 🎨 V4/V6: a manually chosen color takes priority (matches what's shown on the canvas)
                    return (
                    <div key={poly.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", padding: "12px 15px", borderRadius: 8 }}>
                      <div>
                        <strong style={{ color: "#666", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: polyColor }} />
                          Polygon #{index + 1}
                        </strong>
                        <div style={{ marginTop: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: "#444" }}>Class:</span>
                          <input
                            type="text"
                            list="class-suggestions"
                            value={poly.label}
                            onChange={(e) => handlePolygonLabelChange(poly.id, e.target.value)}
                            onBlur={() => registerClassName(poly.label)}
                            style={{ marginLeft: 8, padding: "3px 8px", border: "1px solid #cbd5e1", borderRadius: 5, fontWeight: "bold", color: polyColor, width: "120px" }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: "#888" }}>
                          Point count: {poly.points.length}
                        </div>
                      </div>
                      <button onClick={() => deletePolygon(poly.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: 5 }} title="Delete this Polygon">❌</button>
                    </div>
                    );
                  })}
                </div>
              </>
            )}

            {poses.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: "#0EA5E9", margin: "0 0 10px" }}>🦴 Pose / Keypoint ({poses.length})</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: (landmarks.length > 0 || blurRegions.length > 0) ? 20 : 0 }}>
                  {poses.map((pose, index) => {
                    const poseColor = pose.colorOverride || POSE_LINE_COLOR;
                    const visibleCount = pose.keypoints.filter(p => p.visible !== false).length;
                    return (
                      <div key={pose.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F0F9FF", border: "1px solid #BAE6FD", padding: "12px 15px", borderRadius: 8 }}>
                        <div>
                          <strong style={{ color: poseColor, display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: poseColor }} />
                            Pose #{index + 1}
                          </strong>
                          <div style={{ marginTop: 6, marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: "#444" }}>Class:</span>
                            <input
                              type="text"
                              value={pose.label}
                              onChange={(e) => handlePoseLabelChange(pose.id, e.target.value)}
                              style={{ marginLeft: 8, padding: "3px 8px", border: "1px solid #BAE6FD", borderRadius: 5, fontWeight: "bold", color: poseColor, width: "120px" }}
                            />
                          </div>
                          <div style={{ fontSize: 11, color: "#888" }}>
                            Visible points: {visibleCount}/{POSE_TEMPLATE.names.length}
                          </div>
                        </div>
                        <button onClick={() => deletePose(pose.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: 5 }} title="Delete this Pose">❌</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {landmarks.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: "#8B5CF6", margin: "0 0 10px" }}>📍 Landmark ({landmarks.length})</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: blurRegions.length > 0 ? 20 : 0 }}>
                  {landmarks.map((lm, index) => {
                    const lineColor = lm.colorOverride || LANDMARK_LINE_COLOR;
                    const template = LANDMARK_TEMPLATES[lm.templateType] || LANDMARK_TEMPLATES.face;
                    return (
                      <div key={lm.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F5F3FF", border: "1px solid #DDD6FE", padding: "12px 15px", borderRadius: 8 }}>
                        <div>
                          <strong style={{ color: lineColor, display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: lineColor }} />
                            Landmark #{index + 1} ({template.label})
                          </strong>
                          <div style={{ marginTop: 6, marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: "#444" }}>Class:</span>
                            <input
                              type="text"
                              value={lm.label}
                              onChange={(e) => handleLandmarkLabelChange(lm.id, e.target.value)}
                              style={{ marginLeft: 8, padding: "3px 8px", border: "1px solid #DDD6FE", borderRadius: 5, fontWeight: "bold", color: lineColor, width: "120px" }}
                            />
                          </div>
                          <div style={{ fontSize: 11, color: "#888" }}>
                            Point count: {lm.points.length}
                          </div>
                        </div>
                        <button onClick={() => deleteLandmark(lm.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: 5 }} title="Delete this Landmark">❌</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {blurRegions.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: "#7C3AED", margin: "0 0 10px" }}>🔒 Blur ({blurRegions.length})</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {blurRegions.map((region, index) => {
                    const regionColor = region.color || DEFAULT_BLUR_COLOR;
                    return (
                    <div key={region.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F5F3FF", border: "1px solid #DDD6FE", padding: "12px 15px", borderRadius: 8 }}>
                      <div>
                        <strong style={{ color: regionColor, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: regionColor }} />
                          Blur #{index + 1}
                        </strong>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                          X: {Math.round(region.x)} | Y: {Math.round(region.y)} | W: {Math.round(region.w)} | H: {Math.round(region.h)}
                        </div>
                      </div>
                      <button onClick={() => deleteBlurRegion(region.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: 5 }} title="Delete this blur area">❌</button>
                    </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

    
         

      {/* 📖 Annotation-guide popup */}
      {showAnnotationGuide && (
        <div
          onClick={() => setShowAnnotationGuide(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              maxWidth: 640,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: "#333" }}>📖 Annotation tool usage guide</h3>
              <button
                onClick={() => setShowAnnotationGuide(false)}
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94A3B8", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {ANNOTATION_GUIDE_SECTIONS.map((section) => (
              <div key={section.title} style={{ marginBottom: 18 }}>
                <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#333" }}>
                  {section.icon} {section.title}
                </h4>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#555", lineHeight: 1.7 }}>
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #E5E7EB" }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#333" }}>⌨️ General shortcuts</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#555", lineHeight: 1.7 }}>
                {GENERAL_SHORTCUTS.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}