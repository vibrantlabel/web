import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function DetectionCapture() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const imageContainerRef = useRef(null);

  const project = localStorage.getItem("project_name") || "My Project";

  const initialTotalImages = Number(localStorage.getItem("total_images")) || 0;
  const [totalImagesSaved, setTotalImagesSaved] = useState(initialTotalImages);

  // 🌟 V2: เลือกโหมดวาด Annotation ได้เองต่อวัตถุ ไม่ผูกกับ project_type อีกต่อไป
  // "bbox" = Bounding Box, "polygon" = Polygon — ภาพเดียวกันมีทั้งสองแบบปนกันได้ (mixed annotation)
  const [annotationMode, setAnnotationMode] = useState("bbox");
  const isSegmentation = annotationMode === "polygon"; // คงชื่อเดิมไว้ ลดจุดแก้โค้ดด้านล่างที่เหลือ

  const pageTitle = "🎯 Object Detection & Segmentation";
  const canvasTitle = isSegmentation ? "⬡ Polygon Canvas" : "🟧 Bounding Box Canvas";

  const [capturedImage, setCapturedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // ==========================================================
  // 📷 Camera Source: "browser" (PC Camera) หรือ "esp32" (ESP32-CAM)
  // ==========================================================
  const [cameraSource, setCameraSource] = useState("browser");

  // ค่าที่ผู้ใช้กำลังพิมพ์ในช่อง IP (ยังไม่ยืนยัน)
   const [esp32IpInput, setEsp32IpInput] = useState(
  localStorage.getItem("camera_url") || "192.168.43.181/stream"
);

  // ค่า IP ที่ยืนยันแล้วจริง (กด "เชื่อมต่อ" แล้วเท่านั้น) ใช้สร้าง URL stream
  const [esp32IpConnected, setEsp32IpConnected] = useState(null);

  // สถานะ ESP32: "idle" | "connecting" | "connected" | "error"
  const [esp32Status, setEsp32Status] = useState("idle");

  // ตัวกัน cache ของ browser ตอนต่อ stream ใหม่ (เปลี่ยนค่าเฉพาะตอนกดเชื่อมต่อ ไม่เปลี่ยนทุก render)
  const [esp32StreamKey, setEsp32StreamKey] = useState(0);

  const esp32ImgRef = useRef(null);

  // States สำหรับระบบ Bounding Box (โหมด Detection)
  const [boxes, setBoxes] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState(null);

  // 🎯 ระบบ resize / move กล่องที่วาดไว้แล้ว (โหมด Detection)
  // editingHandle เก็บว่ากำลังลากขอบ/มุมกล่องไหนอยู่ (null = ไม่ได้ลาก)
  const [editingHandle, setEditingHandle] = useState(null); // { boxId, type, startPos, original }
  const [hoverCursor, setHoverCursor] = useState(null); // cursor ที่ควรโชว์ตอนเมาส์แขวนอยู่บนขอบ/มุม (ไม่ได้ลาก)
  const HANDLE_TOLERANCE = 8; // px ระยะที่ถือว่าเมาส์ "แขวนอยู่บนเส้น/มุม"
  const MIN_BOX_SIZE = 5; // px ขนาดกล่องเล็กสุดที่ยอมให้ resize เหลือ

  // States สำหรับระบบ Polygon (โหมด Segmentation)
  const [polygons, setPolygons] = useState([]);
  const [currentPolygonPoints, setCurrentPolygonPoints] = useState([]);
  const [hoverPoint, setHoverPoint] = useState(null);
  const CLOSE_POLYGON_RADIUS = 12; // ระยะ (px) ที่คลิกใกล้จุดแรกพอจะถือว่าปิดรูป

  // ⚫ ระบบลากย้ายจุด (vertex) ของ Polygon ที่วาดเสร็จแล้ว (โหมด Segmentation)
  const [draggingVertex, setDraggingVertex] = useState(null); // { polygonId, pointIndex }
  const VERTEX_HIT_RADIUS = 8; // px ระยะที่ถือว่าเมาส์ "แขวนอยู่บนจุด"
  const suppressNextClickRef = useRef(false); // กันไม่ให้ click ต่อท้ายการลากจุดไปเพิ่มจุดใหม่ซ้อน

  // 🏷️ แก้ label ตรงจุดที่วาด (คลิกป้ายชื่อบนกล่อง/polygon เพื่อแก้ไขได้ทันที)
  const [editingBoxLabelId, setEditingBoxLabelId] = useState(null);
  const [editingPolygonLabelId, setEditingPolygonLabelId] = useState(null);

  // 🔍 ระบบซูม Canvas ด้วย Ctrl + หมุนเมาส์ (ช่วยวาด/แก้ Bounding Box กับ Polygon ได้ละเอียดขึ้น)
  const [zoomLevel, setZoomLevel] = useState(1);
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;

  // ✋ ระบบเลื่อนภาพ (Pan) ด้วยการกดเมาส์ปุ่มกลางค้างแล้วลาก - ใช้ตอนซูมเข้าดูรายละเอียด
  // (จงใจใช้ปุ่มกลางแทนปุ่มซ้าย เพื่อไม่ให้ชนกับการวาดกล่อง/จุด polygon ที่ใช้ปุ่มซ้ายอยู่แล้ว)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, offsetX: 0, offsetY: 0 });

  // โหมด Augmentation ส่งไปให้ Backend ประมวลผล
  const [augMode, setAugMode] = useState("original");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function normalizeCameraUrl(raw) {
  let url = raw.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url;
}

  // เก็บว่าภาพปัจจุบันถูกบันทึกโหมดไหนไปแล้วบ้าง (กันกดซ้ำโหมดเดิมโดยไม่ตั้งใจ)
  const [savedModes, setSavedModes] = useState([]);

  // 🛠️ กลไกเปิด/ปิดกล้อง (เฉพาะ PC Camera / browser)
  useEffect(() => {
    if (isCameraActive && cameraSource === "browser") {
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then((stream) => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch((err) => {
          console.error("Error webcam: ", err);
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

  // ปิดกล้อง/สตรีมทั้งหมด ไม่ว่าจะเป็นแหล่งไหน (ใช้ตอนถ่ายภาพเสร็จ หรือสลับ/อัปโหลดไฟล์แทน)
  const stopAnyCamera = () => {
    stopCamera();
    setIsCameraActive(false);
    setEsp32Status("idle");
    setEsp32IpConnected(null);
  };

  // สลับ Camera Source: ปิดกล้อง/สตรีมของแหล่งเดิมก่อนเสมอ กันค้าง
  const handleSelectCameraSource = (source) => {
    if (source === cameraSource) return;
    stopAnyCamera();
    setCameraSource(source);
  };

  // ==========================================================
  // 📶 ESP32-CAM: กดปุ่ม "เชื่อมต่อ" เพื่อยืนยัน IP แล้วเริ่ม stream จริง
  // ไม่ยิง request อัตโนมัติระหว่างพิมพ์
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

  // ⏪ ระบบ Undo (Ctrl+Z) - เก็บ snapshot ของ boxes/polygons ก่อนทำ action ที่เปลี่ยนแปลงข้อมูล
  // ใช้ ref แทน state เพราะไม่ต้อง re-render จากตัวมันเอง แค่ต้องการอ่าน/เขียนค่าล่าสุดเสมอ
  const historyRef = useRef([]);
  const MAX_HISTORY = 50;

  const pushHistory = () => {
    historyRef.current.push({
      boxes: boxes.map(b => ({ ...b })),
      polygons: polygons.map(p => ({ ...p, points: p.points.map(pt => ({ ...pt })) }))
    });
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
  };

  const undo = () => {
    const last = historyRef.current.pop();
    if (!last) return;
    setBoxes(last.boxes);
    setPolygons(last.polygons);
  };

  // ล้าง annotation (กล่อง/polygon) ทั้งหมดของภาพเดิม เวลาจะเริ่มภาพใหม่
  const resetAnnotations = () => {
    setBoxes([]);
    setPolygons([]);
    setCurrentPolygonPoints([]);
    setHoverPoint(null);
    setSavedModes([]);
    setAugMode("original");
    setEditingHandle(null);
    setHoverCursor(null);
    setEditingBoxLabelId(null);
    setEditingPolygonLabelId(null);
    setZoomLevel(1); // เริ่มภาพใหม่ให้กลับมาซูมปกติเสมอ
    setPanOffset({ x: 0, y: 0 }); // และเลื่อนภาพกลับตำแหน่งกึ่งกลางเสมอ
    setIsPanning(false);
    setDraggingVertex(null);
    historyRef.current = []; // undo ข้ามภาพกันไม่ได้ (และไม่ควรได้) เลยล้างประวัติทิ้งด้วย
  };

  // 📸 ถ่ายภาพจากแหล่งปัจจุบัน (video ของ PC Camera หรือ img stream ของ ESP32-CAM)
  const captureSnapshot = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (cameraSource === "browser") {
      if (!videoRef.current || videoRef.current.videoWidth === 0) return;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      const img = esp32ImgRef.current;
      if (!img || !img.complete || img.naturalWidth === 0) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    setCapturedImage(canvas.toDataURL("image/jpeg"));
    resetAnnotations();
    stopAnyCamera();
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target.result);
        resetAnnotations();
        stopAnyCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  // 🎯 ฟังก์ชันการคำนวณตำแหน่งเมาส์บนคอนเทนเนอร์
  // กล่อง/Polygon เก็บพิกัดอ้างอิงกับพื้นที่ container ต้นฉบับ (ไม่ scale/pan) เสมอ
  // ถ้ากำลังซูม/เลื่อนภาพอยู่ ต้องแปลงตำแหน่งเมาส์ที่เห็นบนจอ กลับเป็นพิกัด "ก่อนแปลง" ก่อน
  // ไม่งั้นวาด/ลาก resize ตอนซูมหรือเลื่อนภาพแล้วพิกัดจะเพี้ยนไม่ตรงกับที่เห็น
  const getMousePos = (e) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };
    const rect = imageContainerRef.current.getBoundingClientRect();

    // ตำแหน่งดิบเทียบกับ container (พิกัดหน้าจอ ยังไม่ปรับ pan/zoom)
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    // ย้อน pan ก่อน (translate ทำงานเป็น "pixel จอจริง" อยู่แล้วไม่ว่าจะซูมแค่ไหน)
    x -= panOffset.x;
    y -= panOffset.y;

    if (zoomLevel !== 1) {
      // เนื้อหาข้างในถูกขยายรอบจุดกึ่งกลาง container (transform-origin: center center)
      // จึงต้องแปลงกลับโดยอิงจุดกึ่งกลางเดียวกัน
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      x = cx + (x - cx) / zoomLevel;
      y = cy + (y - cy) / zoomLevel;
    }

    // จำกัดไม่ให้ตำแหน่งพิกัด "จริง" หลุดออกนอกขอบพื้นที่รูปภาพ (Clamp)
    x = Math.max(0, Math.min(x, rect.width));
    y = Math.max(0, Math.min(y, rect.height));

    return { x, y };
  };

  // ✋ ขอบเขตที่ยอมให้เลื่อนภาพ (pan) ได้ตามระดับซูมปัจจุบัน กันลากภาพหลุดจอไปเลย
  // รับ zoomOverride ไว้เผื่อเรียกตอนซูมเพิ่ง set state ใหม่ (state เดิมยังไม่อัปเดตในรอบ synchronous นั้น)
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
  // 🟧 Bounding Box (โหมด Detection) - ลากเมาส์วาดกล่อง / resize / move
  // ==========================================================

  // ตรวจว่าตำแหน่งเมาส์ pos อยู่ตรงขอบ/มุมของกล่อง box ไหน (คืน type หรือ null)
  const getBoxHandleAt = (pos, box) => {
    const nearLeft = Math.abs(pos.x - box.x) <= HANDLE_TOLERANCE;
    const nearRight = Math.abs(pos.x - (box.x + box.w)) <= HANDLE_TOLERANCE;
    const nearTop = Math.abs(pos.y - box.y) <= HANDLE_TOLERANCE;
    const nearBottom = Math.abs(pos.y - (box.y + box.h)) <= HANDLE_TOLERANCE;

    // ต้องอยู่ในกรอบกล่อง (บวก tolerance) ก่อน ไม่งั้นจุดไกลๆ ที่บังเอิญพิกัดตรงแนวเส้นจะโดนด้วย
    const insideXPad = pos.x >= box.x - HANDLE_TOLERANCE && pos.x <= box.x + box.w + HANDLE_TOLERANCE;
    const insideYPad = pos.y >= box.y - HANDLE_TOLERANCE && pos.y <= box.y + box.h + HANDLE_TOLERANCE;
    if (!insideXPad || !insideYPad) return null;

    // มุม = ใกล้ทั้งขอบแนวตั้งและแนวนอนพร้อมกัน -> ใช้สำหรับ "ย้าย" ทั้งกล่อง
    const isCorner = (nearLeft || nearRight) && (nearTop || nearBottom);
    if (isCorner) return "corner";

    if (nearTop) return "edge-top";       // เส้นบน (แนวนอน) -> ลูกศรขึ้น-ลง, ขยายความสูง
    if (nearBottom) return "edge-bottom"; // เส้นล่าง (แนวนอน) -> ลูกศรขึ้น-ลง, ขยายความสูง
    if (nearLeft) return "edge-left";     // เส้นซ้าย (แนวตั้ง) -> ลูกศรซ้าย-ขวา, ขยายความกว้าง
    if (nearRight) return "edge-right";   // เส้นขวา (แนวตั้ง) -> ลูกศรซ้าย-ขวา, ขยายความกว้าง
    return null;
  };

  // หา handle ที่เมาส์แขวนอยู่ ไล่จากกล่องที่วาดล่าสุดก่อน (ซ้อนบนสุด)
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
        return "ns-resize";   // ลูกศรขึ้น-ลง
      case "edge-left":
      case "edge-right":
        return "ew-resize";   // ลูกศรซ้าย-ขวา
      case "corner":
        return "move";        // ย้ายทั้งกล่อง
      default:
        return null;
    }
  };

  // ตรวจว่าตำแหน่งเมาส์ pos อยู่ใกล้จุด (vertex) ของ polygon ไหนบ้าง (คืน { polygonId, pointIndex } หรือ null)
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

  const handleMouseDown = (e) => {
    if (!capturedImage) return;
    // บังคับให้วาด/แก้ไขได้เฉพาะตอนพรีวิวโหมด original เท่านั้น
    // (ตอน preview โหมดอื่น รูปถูก transform ด้วย CSS แต่พิกัดเมาส์ยังอ้างอิงกับ container เดิม
    //  ถ้าวาด/ลากตอนนั้นพิกัดจะไม่ตรงกับภาพต้นฉบับ)
    if (augMode !== "original") return;
    const pos = getMousePos(e);

    if (isSegmentation) {
      // ⚫ Segmentation: เช็คว่ากดตรงจุด (vertex) ของ polygon ที่วาดเสร็จแล้วไหม -> ลากย้ายจุดนั้น
      const vertexHit = findPolygonVertexAt(pos);
      if (vertexHit) {
        pushHistory();
        setDraggingVertex(vertexHit);
        suppressNextClickRef.current = true; // กัน onClick ต่อท้ายไปเพิ่มจุดใหม่ซ้อน
      }
      return; // การเพิ่มจุดใหม่ของ Segmentation ใช้ onClick ไม่ใช่ onMouseDown
    }

    // 🟧 Detection: เช็คก่อนว่าคลิกโดนขอบ/มุมของกล่องที่วาดไว้แล้วไหม ถ้าใช่ -> resize/move แทนการวาดกล่องใหม่
    const handle = findHandleAtPos(pos);
    if (handle) {
      pushHistory(); // เก็บ snapshot ก่อนเริ่มลาก จะได้ Ctrl+Z ย้อนทั้งการลากเป็น 1 ก้อนได้
      const targetBox = boxes.find(b => b.id === handle.boxId);
      setEditingHandle({
        boxId: handle.boxId,
        type: handle.type,
        startPos: pos,
        original: { ...targetBox }
      });
      return;
    }

    // ไม่โดนกล่องเดิม -> เริ่มวาดกล่องใหม่ตามปกติ
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  // ✋ ปุ่มกลางเมาส์ค้างแล้วลาก -> เลื่อนภาพ (Pan) ใช้ได้ทั้ง Detection และ Segmentation
  // (จงใจแยกจาก handleMouseDown ปกติ เพราะปุ่มกลางไม่ชนกับปุ่มซ้ายที่ใช้วาด/ลากอยู่แล้ว)
  const handleContainerMouseDown = (e) => {
    if (e.button === 1) {
      e.preventDefault();
      if (!capturedImage || zoomLevel <= 1) return; // ไม่มีอะไรให้ pan ตอนไม่ได้ซูม
      setIsPanning(true);
      panStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        offsetX: panOffset.x,
        offsetY: panOffset.y
      };
      return;
    }
    handleMouseDown(e);
  };

  const handleMouseMove = (e) => {
    if (isSegmentation) {
      const pos = getMousePos(e);

      // ⚫ กำลังลากจุด (vertex) ของ polygon เดิมอยู่
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

      // ระหว่างวาด Polygon ให้อัปเดตจุดปลายเส้นประตามเมาส์ (rubber-band preview)
      if (currentPolygonPoints.length > 0 && augMode === "original") {
        setHoverPoint(pos);
        return;
      }

      // ไม่ได้ลากอะไรอยู่ -> เช็คว่าเมาส์แขวนอยู่บนจุดเดิมไหม เพื่อเปลี่ยน cursor เป็นรูปมือจับ
      if (augMode === "original") {
        const vertexHit = findPolygonVertexAt(pos);
        setHoverCursor(vertexHit ? "grab" : null);
      }
      return;
    }

    const pos = getMousePos(e);

    // 🔧 กำลังลาก resize/move กล่องเดิมอยู่
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
          // ย้ายทั้งกล่อง (ขนาดเท่าเดิม)
          newX = orig.x + dx;
          newY = orig.y + dy;
          break;
        }
        default:
          break;
      }

      // Clamp ไม่ให้กล่องหลุดขอบ container
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

    // ไม่ได้ลากอะไรอยู่ -> เช็คว่าเมาส์แขวนอยู่บนขอบ/มุมกล่องไหน เพื่อเปลี่ยน cursor
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
    if (isSegmentation) {
      if (draggingVertex) setDraggingVertex(null);
      return;
    }

    if (editingHandle) {
      setEditingHandle(null);
      return;
    }

    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);

    // บันทึกกล่องเฉพาะกรณีที่มีขนาดใหญ่กว่า 5x5 พิกเซล เพื่อป้องกันการกดคลิกพลาด
    if (currentBox.w > 5 && currentBox.h > 5) {
      pushHistory();
      setBoxes([...boxes, { ...currentBox, id: Date.now(), label: "object" }]);
    }
    setCurrentBox(null);
  };

  // ✋ container-level wrapper: จัดการลาก pan (ปุ่มกลาง) ก่อน แล้วค่อยส่งต่อให้ logic ปกติ
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

  // ==========================================================
  // ⬡ Polygon (โหมด Segmentation) - คลิกทีละจุด
  // ==========================================================
  const finishPolygon = () => {
    if (currentPolygonPoints.length < 3) {
      alert("ต้องคลิกอย่างน้อย 3 จุด ก่อนจะปิดรูป Polygon ได้");
      return;
    }
    pushHistory();
    setPolygons(prev => [...prev, { id: Date.now(), label: "object", points: currentPolygonPoints }]);
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

  // ⌨️ Keyboard shortcuts บน Interactive Canvas
  // Ctrl+Z / Cmd+Z : undo หนึ่งเหตุการณ์ล่าสุด (ทั้งกล่องและ polygon)
  // r              : ระหว่างลากจุด polygon อยู่ -> ถอยจุดล่าสุด 1 จุด
  // Escape         : ยกเลิก polygon ที่วาดค้างอยู่ทั้งหมด
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const isTextInput = tag === "INPUT" || tag === "TEXTAREA";
      if (isTextInput) return; // อย่าไปแย่ง Ctrl+Z ตอนกำลังพิมพ์แก้ label อยู่ (ให้ browser undo ข้อความปกติ)

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
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
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSegmentation, currentPolygonPoints]);

  // 🔍 Ctrl + หมุนเมาส์ (scroll) -> ซูมเข้า/ออก Canvas
  // ต้องผูก native event listener ด้วย { passive: false } เพราะ React ผูก onWheel
  // แบบ passive มาให้โดย default ทำให้ e.preventDefault() ในนั้นใช้ไม่ได้ (กันหน้าเว็บเลื่อน/ซูมของเบราว์เซอร์ไม่ได้)
  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;

    const handleWheelZoom = (e) => {
      if (!e.ctrlKey) return; // ไม่ได้กด Ctrl ก็ปล่อยให้ scroll หน้าเว็บทำงานปกติ
      e.preventDefault();
      setZoomLevel((prev) => {
        const next = prev - e.deltaY * 0.0025; // เลื่อนขึ้น (deltaY ติดลบ) = ซูมเข้า
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(3))));
        // ซูมออกแล้วขอบเขต pan จะแคบลง ต้องบีบ panOffset เดิมให้อยู่ในขอบเขตใหม่ด้วย
        setPanOffset((prevPan) => clampPanOffset(prevPan, clamped));
        return clamped;
      });
    };

    el.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => el.removeEventListener("wheel", handleWheelZoom);
  }, []);

  const handleContainerClick = (e) => {
    if (suppressNextClickRef.current) {
      // click นี้ต่อท้ายการลากจุด (vertex) เสร็จพอดี -> ข้าม ไม่ให้ไปเพิ่มจุดใหม่ซ้อน
      suppressNextClickRef.current = false;
      return;
    }
    if (!isSegmentation || !capturedImage || augMode !== "original") return;
    const pos = getMousePos(e);

    // คลิกใกล้จุดแรกพอ (และมีอย่างน้อย 3 จุดแล้ว) ให้ถือว่าปิดรูป
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

  const deletePolygon = (id) => {
    pushHistory();
    setPolygons(polygons.filter(p => p.id !== id));
    if (editingPolygonLabelId === id) setEditingPolygonLabelId(null);
    if (draggingVertex && draggingVertex.polygonId === id) setDraggingVertex(null);
  };

  const handlePolygonLabelChange = (id, newName) => {
    setPolygons(polygons.map(p => p.id === id ? { ...p, label: newName } : p));
  };

  // ==========================================================
  // 🖱️ คลิกขวา -> ลบกล่อง/polygon ตรงตำแหน่งที่ชี้อยู่ทันที
  // ==========================================================
  const pointInBox = (pos, box) =>
    pos.x >= box.x && pos.x <= box.x + box.w && pos.y >= box.y && pos.y <= box.y + box.h;

  // Ray-casting algorithm มาตรฐานสำหรับเช็คจุดอยู่ในรูปหลายเหลี่ยมหรือไม่
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
    e.preventDefault(); // กัน context menu เดิมของเบราว์เซอร์เสมอ ไม่ว่าจะโดนกล่อง/polygon หรือไม่
    if (!capturedImage || augMode !== "original") return;
    const pos = getMousePos(e);

    // 🌟 V2: เช็คทั้ง polygon และ box เสมอ ไม่ผูกกับโหมดที่กำลังเลือกวาดอยู่
    // เพราะภาพเดียวกันมีทั้งสองแบบปนกันได้ ลบได้ทันทีไม่ต้องสลับโหมดก่อน
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
  };

  // เปลี่ยนโหมด Augmentation: ถ้ากำลังวาด polygon ค้างอยู่ ให้เตือนก่อนล้างจุดทิ้ง
  const handleAugModeChange = (newMode) => {
    if (isSegmentation && currentPolygonPoints.length > 0 && newMode !== "original") {
      const confirmed = window.confirm(
        "มีจุด Polygon ที่ยังวาดค้างอยู่ (ยังไม่ปิดรูป) การเปลี่ยนโหมดจะล้างจุดเหล่านั้นทิ้ง ต้องการดำเนินการต่อหรือไม่?"
      );
      if (!confirmed) return;
      setCurrentPolygonPoints([]);
      setHoverPoint(null);
    }
    setAugMode(newMode);
  };

  // 🌟 V2: เปลี่ยนโหมดวาด Annotation (Bounding Box <-> Polygon)
  // ถ้ากำลังวาด polygon ค้างอยู่ (ยังไม่ปิดรูป) เตือนก่อนล้างจุดทิ้ง
  // (boxes และ polygons ที่วาดเสร็จแล้วไม่หายไปตอนสลับโหมด ยังอยู่บนภาพเดิมเสมอ)
  const handleAnnotationModeChange = (newMode) => {
    if (newMode === annotationMode) return;
    if (annotationMode === "polygon" && currentPolygonPoints.length > 0) {
      const confirmed = window.confirm(
        "มีจุด Polygon ที่ยังวาดค้างอยู่ (ยังไม่ปิดรูป) การสลับโหมดจะล้างจุดเหล่านั้นทิ้ง ต้องการดำเนินการต่อหรือไม่?"
      );
      if (!confirmed) return;
      setCurrentPolygonPoints([]);
      setHoverPoint(null);
    }
    setAnnotationMode(newMode);
  };

  // 🔄 คำนวณ transform สำหรับพรีวิวภาพ+กล่อง/polygon ให้ตรงกับ augMode
  // รูปกับ annotation อยู่ใน wrapper เดียวกัน พอ transform พร้อมกัน annotation จะติดไปกับรูปโดยอัตโนมัติ
  const getPreviewTransform = () => {
    switch (augMode) {
      case "rotation_-10": return "rotate(-10deg)";
      case "rotation_10": return "rotate(10deg)";
      case "zoom_in": return "scale(1.15)";
      case "flip_horizontal": return "scaleX(-1)";
      default: return "none";
    }
  };

  // 🔍 รวม transform ของพรีวิว augmentation + zoom (Ctrl+scroll) + pan (ลากปุ่มกลางเมาส์)
  // ลำดับสำคัญ: translate ต้องอยู่ซ้ายสุด (คำนวณทีหลังสุดตามกลไก CSS transform) เพื่อให้
  // ระยะ pan ที่กำหนด (px) ตรงกับระยะที่ลากเมาส์จริง 1:1 ไม่ว่าจะซูมอยู่ระดับไหนก็ตาม
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

  // 🌗 pixel-level augmentation ไม่กระทบตำแหน่งกล่อง/polygon (geometry) จึงใส่แค่ filter ที่ตัวรูปพอ
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

  // 📈 คำนวณสถานะความพร้อมข้อมูล
  const getReadinessStatus = () => {
    const estimatedBoxes = totalImagesSaved * 3; // ปรับตัวคูณตามความเป็นจริงเฉลี่ย

    if (totalImagesSaved <= 20) {
      return {
        text: `🔴 ข้อมูลยังน้อยเกินไป (มี ${totalImagesSaved} ภาพ ) โมเดลอาจจะเกิดอาการ Overfitting สูง`,
        color: "#EF4444",
        bg: "#FEF2F2",
        percent: Math.min((totalImagesSaved / 100) * 100, 20)
      };
    } else if (totalImagesSaved <= 80) {
      return {
        text: `🟡 ข้อมูลระดับเริ่มต้น (มี ${totalImagesSaved} ภาพ / ~${estimatedBoxes} กล่อง) เหมาะสำหรับทดสอบ POC แนะนำให้เพิ่มภาพคละมุมมอง`,
        color: "#F59E0B",
        bg: "#FEF3C7",
        percent: (totalImagesSaved / 100) * 100
      };
    } else {
      return {
        text: `🟢 ข้อมูลเพียงพอสำหรับระดับพื้นฐาน (มี ${totalImagesSaved} ภาพ) สามารถกดเข้าสู่ขั้นตอนการเทรนโมเดลได้เลย`,
        color: "#10B981",
        bg: "#ECFDF5",
        percent: 100
      };
    }
  };

  const status = getReadinessStatus();

  // 🎨 กลุ่ม augmentation ที่ไม่กระทบตำแหน่ง annotation (ปลอดภัยที่จะแปลงจริงฝั่ง client)
  const PIXEL_LEVEL_MODES = [
    "grayscale", "blur",
    "brightness_dark", "brightness_bright",
    "contrast_low", "contrast_high",
    "saturation_low", "saturation_high"
  ];

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

  // แปลงภาพจริงด้วย Canvas ตาม pixel-level augMode ก่อนส่งขึ้นเซิร์ฟเวอร์
  // (ใช้ ctx.filter วาดภาพต้นฉบับใหม่ลง canvas ขนาดเท่าภาพจริง -> ได้ dataURL ที่ถูกแปลงแล้วจริง)
  const applyPixelAugmentation = (dataUrl, mode) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.filter = getCanvasFilter(mode);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      };
      img.onerror = () => reject(new Error("โหลดภาพเพื่อประมวลผลไม่สำเร็จ"));
      img.src = dataUrl;
    });
  };

  // 🚀 ส่งข้อมูลเข้า Flask API (V2: ส่งทั้ง bounding_boxes และ polygons พร้อมกันได้)
  const saveImageToDataset = async () => {
    const serverUrl = localStorage.getItem("cloud_url");
    const email = localStorage.getItem("email");

    if (!serverUrl || !email) {
      alert("กรุณาตรวจสอบการตั้งค่า Cloud URL และการ Login ของคุณ");
      return;
    }

    // ✅ V2: ต้องมีอย่างน้อย 1 annotation ไม่ว่าจะเป็น box หรือ polygon (หรือปนกันก็ได้)
    if (boxes.length === 0 && polygons.length === 0) {
      alert("กรุณาวาด Bounding Box หรือ Polygon อย่างน้อย 1 รายการก่อนบันทึก");
      return;
    }

    if (savedModes.includes(augMode)) {
      alert(`โหมด [${augMode}] ถูกบันทึกไปแล้วสำหรับภาพนี้ กรุณาเลือกโหมดอื่น`);
      return;
    }

    setIsSubmitting(true);
    const cleanServerUrl = serverUrl.replace(/\/$/, "");

    // ดึงขนาดจริงของ HTML Container เพื่อส่งไปทำ Normalize พิกัดที่ฝั่ง Backend 
    const container = imageContainerRef.current.getBoundingClientRect();

    // 🖼️ ถ้าเป็นโหมด pixel-level (grayscale/blur/brightness/contrast/saturation)
    // แปลงภาพจริงด้วย Canvas ก่อนส่ง เพื่อให้ไฟล์ที่บันทึกตรงกับที่เลือกจริง
    // ส่วนโหมด geometric (rotate/zoom/flip) ยังส่งภาพต้นฉบับ + aug_mode ให้ backend แปลง
    // เพราะต้องคำนวณตำแหน่ง annotation ใหม่ตามรูปทรง ยังไม่รองรับฝั่ง client
    let imageToSend = capturedImage;
    if (PIXEL_LEVEL_MODES.includes(augMode)) {
      try {
        imageToSend = await applyPixelAugmentation(capturedImage, augMode);
      } catch (err) {
        console.error("Canvas augmentation error:", err);
        alert("ไม่สามารถประมวลผลภาพโหมดนี้ได้ กรุณาลองใหม่อีกครั้ง");
        setIsSubmitting(false);
        return;
      }
    }

    // 🌟 V2: ส่งทั้ง bounding_boxes และ polygons พร้อมกันในคำขอเดียว (mixed annotation)
    const payload = {
      email: email,
      project_name: project,
      aug_mode: augMode,
      image_data: imageToSend,
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
      }))
    };

    try {
      const response = await fetch(`${cleanServerUrl}/api/upload_dataset_v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok) {
        const newTotal = totalImagesSaved + 1;
        setTotalImagesSaved(newTotal);
        localStorage.setItem("total_images", newTotal);
        setSavedModes([...savedModes, augMode]);

        alert(`บันทึกภาพโหมด [${augMode}] สำเร็จ! (สะสมรวม: ${newTotal} ภาพ) สามารถเลือกโหมด Augmentation อื่นแล้วบันทึกภาพ/annotation เดิมซ้ำได้`);
        // ไม่ clear capturedImage และ annotation เพื่อให้เลือก augMode อื่นแล้วบันทึกภาพ+annotation เดิมต่อได้
      } else {
        alert(`Server Error: ${result.error || "เกิดข้อผิดพลาดคลังข้อมูล"}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบ Network ของคุณ");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ล้างภาพ+annotation ด้วยตัวเอง เมื่อทำครบทุกโหมดที่ต้องการแล้ว
  const clearWorkspace = () => {
    setCapturedImage(null);
    resetAnnotations();
  };

  const isCurrentModeSaved = savedModes.includes(augMode);
  // 🌟 V2: นับรวมทั้ง box และ polygon เพราะภาพเดียวกันมีทั้งสองแบบปนกันได้
  const annotationCount = boxes.length + polygons.length;
  const saveDisabled = annotationCount === 0 || isSubmitting || isCurrentModeSaved;

  // สถานะพรีวิวรวม: ใช้ตัดสินว่าจะโชว์ placeholder หรือ video/img จริง
  const isEsp32StreamShown = cameraSource === "esp32" && !!esp32IpConnected;
 
  return (
    <div style={{ maxWidth: 1500, margin: "30px auto", padding: 25, fontFamily: "Segoe UI, sans-serif" }}>

      {/* ส่วนหัวหน้าเว็บ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 25 }}>
        <div>
          <button onClick={() => navigate(-1)} style={{ padding: "8px 16px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer", marginRight: 15 }}>🎒 กลับหน้าหลัก</button>
          <span style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>Project: {project}</span>
        </div>
        <h2 style={{ margin: 0, color: "#E28743" }}>{pageTitle}</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 25, marginBottom: 25 }}>

        {/* ฝั่งซ้าย: Source */}
        <div style={{ background: "#fff", padding: 20, borderRadius: 15, border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
          <h3 style={{ marginTop: 0, marginBottom: 15 }}>📷 Input Source</h3>

          {/* ================= Camera Source Selector ================= */}
          <div style={{ display: "flex", gap: 18, marginBottom: 12, fontSize: 13.5 }}>
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
              📶 ESP32-CAM
            </label>
          </div>

          {cameraSource === "browser" ? (

            <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
              <button
                onClick={() => setIsCameraActive(!isCameraActive)}
                style={{ flex: 1, padding: "12px", background: isCameraActive ? "#EF4444" : "#0078D7", color: "white", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer" }}
              >
                {isCameraActive ? "🛑 ปิดกล้องสด" : "🎥 เปิดกล้อง Realtime"}
              </button>

              <label style={{ flex: 1, padding: "12px", background: "#10B981", color: "white", borderRadius: 10, fontWeight: "bold", cursor: "pointer", textAlign: "center" }}>
                {"📂 ดึงภาพจากภายนอก"}
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
                    // แก้ IP ระหว่างที่เชื่อมต่ออยู่ -> ต้องกดเชื่อมต่อใหม่ก่อนถึงจะใช้ได้
                    setEsp32Status("idle");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConnectEsp32();
                  }}
                  placeholder="192.168.43.181/stream (ESP32-CAM) หรือ 192.168.1.50 (กล้อง IP ทั่วไป)"
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
                  {esp32Status === "connected" ? "✅ เชื่อมต่อแล้ว" : "🔌 เชื่อมต่อ"}
                </button>
              </div>

              {esp32Status === "connecting" && (
                <p style={{ color: "#D97706", fontSize: 12.5, margin: "0 0 8px" }}>⏳ กำลังเชื่อมต่อ...</p>
              )}
              {esp32Status === "error" && (
                <p style={{ color: "#EF4444", fontSize: 12.5, margin: "0 0 8px" }}>
                  ❌ ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบ IP และเครือข่าย
                </p>
              )}
              {esp32Status === "connected" && (
                <p style={{ color: "#10B981", fontSize: 12.5, margin: "0 0 8px" }}>
                  ✅ เชื่อมต่อกับ {esp32IpConnected} สำเร็จ
                </p>
              )}

              <label style={{ display: "block", padding: "12px", background: "#10B981", color: "white", borderRadius: 10, fontWeight: "bold", cursor: "pointer", textAlign: "center" }}>
                {"📂 ดึงภาพจากภายนอก"}
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
                  <p style={{ color: "#aaa" }}>กดเปิดกล้อง หรือคลิกอัปโหลดภาพทางด้านบน</p>
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
                      ⏳ กำลังเชื่อมต่อ...
                    </div>
                  )}

                  {esp32Status === "error" && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 14, textAlign: "center", padding: 20 }}>
                      ❌ เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบ IP และเครือข่าย
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: "#666", textAlign: "center", padding: 20 }}>
                  <p style={{ fontSize: 48, margin: 0 }}>📹</p>
                  <p style={{ color: "#aaa" }}>กรอก IP แล้วกด "เชื่อมต่อ" ก่อนเริ่มใช้งานกล้อง</p>
                </div>
              )

            )}

          </div>
        </div>

        {/* ฝั่งขวา: Interactive Canvas */}
        <div style={{ background: "#fff", padding: 20, borderRadius: 15, border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 style={{ marginTop: 0, marginBottom: 5 }}>{canvasTitle}</h3>
              {capturedImage && (
                <button
                  onClick={clearWorkspace}
                  style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
                >
                  🗑️ ล้างภาพนี้ทิ้ง
                </button>
              )}
            </div>

            {/* 🌟 V2: เลือกโหมดวาด Annotation ต่อวัตถุ - Bounding Box หรือ Polygon
                ภาพเดียวกันมีทั้งสองแบบปนกันได้ สลับโหมดไปมาได้อิสระ ของเก่าไม่หายไป */}
            <div style={{ display: "flex", gap: 18, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13.5, fontWeight: annotationMode === "bbox" ? "bold" : "normal", color: annotationMode === "bbox" ? "#0078D7" : "#666" }}>
                <input
                  type="radio"
                  checked={annotationMode === "bbox"}
                  onChange={() => handleAnnotationModeChange("bbox")}
                />
                🟧 Bounding Box
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13.5, fontWeight: annotationMode === "polygon" ? "bold" : "normal", color: annotationMode === "polygon" ? "#0078D7" : "#666" }}>
                <input
                  type="radio"
                  checked={annotationMode === "polygon"}
                  onChange={() => handleAnnotationModeChange("polygon")}
                />
                ⬡ Polygon
              </label>
            </div>

            <p style={{ fontSize: 13, color: "#666", marginTop: 0, marginBottom: 8 }}>
              {isSegmentation
                ? "คลิกเพิ่มจุดขอบเขตวัตถุทีละจุด แล้วคลิกจุดแรกซ้ำ (หรือกดปุ่ม ✅ ปิดรูป) เพื่อปิด Polygon — ลากจุดที่วาดไว้แล้วเพื่อปรับตำแหน่งได้"
                : "คลิกแล้วลากกรอบสี่เหลี่ยมครอบตำแหน่งวัตถุที่ต้องการตรวจจับ"}
            </p>
            {capturedImage && augMode !== "original" && (
              <p style={{ fontSize: 12, color: "#0078D7", marginTop: 0, marginBottom: 8 }}>
                * กำลังพรีวิวโหมด [{augMode}] แบบประมาณ (ผลจริงคำนวณที่ Server) — สลับกลับ Original เพื่อวาดเพิ่ม
              </p>
            )}

            {/* 🖼️➕📊 Canvas + แถบเลื่อนแนวตั้ง (โผล่มาเฉพาะตอนซูมอยู่ ใช้ดูภาพส่วนบน-ล่างที่ถูกซูมออกนอกจอ) */}
            {/* ⚠️ สำคัญ: ต้องใช้ position:absolute วางแถบเลื่อนแนวตั้ง ไม่ใช้ flex-row แบบเดิม
                เพราะถ้าใช้ flex-row จะทำให้ canvas แคบลง/กว้างขึ้นตอนโชว์/ซ่อนแถบเลื่อน
                กระทบ imageContainerRef.getBoundingClientRect().width ซึ่งเป็น "จุดอ้างอิงกลาง"
                ที่กล่อง/Polygon ใช้คำนวณพิกัด ทำให้ตำแหน่งเพี้ยนตอนซูมออกกลับ 100% (บั๊กที่เจอ) */}
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
                }}
                onClick={handleContainerClick}
                onContextMenu={handleContainerContextMenu}
                style={{
                  width: "100%",
                  height: 380,
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
                          ? (draggingVertex ? "grabbing" : (hoverCursor || "crosshair"))
                          : (editingHandle ? getCursorForHandleType(editingHandle.type) : (hoverCursor || "crosshair")),
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
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      pointerEvents: "none",
                      filter: getPreviewFilter(),
                      transition: "filter 0.3s ease"
                    }}
                  />

                  {/* 🌟 V2: แสดง Polygon และ Bounding Box พร้อมกันเสมอ ไม่ผูกกับโหมดที่กำลังเลือกวาดอยู่
                      เพราะภาพเดียวกันมีทั้งสองแบบปนกันได้ (mixed annotation) */}

                  {/* ⬡ Polygon overlay (SVG วาดทับรูป) */}
                  <svg
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                  >
                    {polygons.map((poly) => (
                      <g key={poly.id}>
                        <polygon
                          points={poly.points.map(p => `${p.x},${p.y}`).join(" ")}
                          fill="rgba(226, 135, 67, 0.18)"
                          stroke="#E28743"
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
                              fill={isBeingDragged ? "#0078D7" : "#E28743"}
                              stroke="#fff"
                              strokeWidth="1.5"
                            />
                          );
                        })}
                        {poly.points[0] && (
                          <foreignObject
                            x={poly.points[0].x}
                            y={Math.max(0, poly.points[0].y - 26)}
                            width="150"
                            height="24"
                            style={{ overflow: "visible", pointerEvents: "auto" }}
                          >
                            {editingPolygonLabelId === poly.id ? (
                              <input
                                type="text"
                                autoFocus
                                value={poly.label}
                                onChange={(e) => handlePolygonLabelChange(poly.id, e.target.value)}
                                onBlur={() => setEditingPolygonLabelId(null)}
                                onKeyDown={(e) => { if (e.key === "Enter") setEditingPolygonLabelId(null); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: 11, fontWeight: "bold", padding: "2px 6px", border: "1px solid #E28743", borderRadius: 4, width: 110, color: "#E28743" }}
                              />
                            ) : (
                              <span
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); pushHistory(); setEditingPolygonLabelId(poly.id); }}
                                title="คลิกเพื่อแก้ชื่อ label"
                                style={{ display: "inline-block", background: "#E28743", color: "#fff", fontSize: 11, fontWeight: "bold", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", cursor: "pointer" }}
                              >
                                {poly.label}
                              </span>
                            )}
                          </foreignObject>
                        )}
                      </g>
                    ))}

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
                  </svg>

                  {/* 🟧 Bounding boxes */}
                  {boxes.map((box) => (
                    <div
                      key={box.id}
                      style={{
                        position: "absolute",
                        left: box.x,
                        top: box.y,
                        width: box.w,
                        height: box.h,
                        border: "2px solid #E28743",
                        background: "rgba(226, 135, 67, 0.15)",
                        pointerEvents: "none"
                      }}
                    >
                      {editingBoxLabelId === box.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={box.label}
                          onChange={(e) => handleLabelChange(box.id, e.target.value)}
                          onBlur={() => setEditingBoxLabelId(null)}
                          onKeyDown={(e) => { if (e.key === "Enter") setEditingBoxLabelId(null); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          style={{ position: "absolute", top: -24, left: -2, fontSize: 11, fontWeight: "bold", padding: "2px 6px", border: "1px solid #E28743", borderRadius: 4, width: 100, color: "#E28743", pointerEvents: "auto" }}
                        />
                      ) : (
                        <span
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); pushHistory(); setEditingBoxLabelId(box.id); }}
                          title="คลิกเพื่อแก้ชื่อ label"
                          style={{ position: "absolute", top: -22, left: -2, background: "#E28743", color: "#fff", fontSize: 11, padding: "2px 6px", borderRadius: "4px 4px 0 0", whiteSpace: "nowrap", cursor: "pointer", pointerEvents: "auto" }}
                        >
                          {box.label}
                        </span>
                      )}
                    </div>
                  ))}

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
                </div>
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>
                  ยังไม่มีรูปถ่าย (กรุณากดถ่ายภาพหรือคลิกดึงไฟล์ภาพจากฝั่งซ้ายก่อน)
                </div>
              )}
              </div>

              {/* ↕️ แถบเลื่อนแนวตั้ง (บน-ล่าง) โผล่มาเฉพาะตอนซูมอยู่
                  วางแบบ absolute ทับขอบขวาของ canvas เดิม (ไม่แย่งพื้นที่ ไม่กระทบขนาด container) */}
              {capturedImage && zoomLevel > 1 && (
                <div style={{ position: "absolute", top: 0, right: 4, width: 22, height: 380, pointerEvents: "none" }}>
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
                    title="เลื่อนภาพขึ้น-ลง"
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      width: 380,
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

            {/* ↔️ แถบเลื่อนแนวนอน (ซ้าย-ขวา) โผล่มาเฉพาะตอนซูมอยู่ */}
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
                  title="เลื่อนภาพซ้าย-ขวา"
                  style={{ flex: 1, cursor: "pointer", accentColor: "#0078D7" }}
                />
              </div>
            )}

            {/* 🎛️ แถบควบคุม Polygon เฉพาะตอนเลือกโหมด Polygon อยู่ */}
            {isSegmentation && capturedImage && augMode === "original" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={finishPolygon}
                  disabled={currentPolygonPoints.length < 3}
                  style={{ padding: "6px 14px", background: currentPolygonPoints.length < 3 ? "#ccc" : "#10B981", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: "bold", cursor: currentPolygonPoints.length < 3 ? "not-allowed" : "pointer" }}
                >
                  ✅ ปิดรูป Polygon ({currentPolygonPoints.length} จุด)
                </button>
                <button
                  onClick={undoLastPolygonPoint}
                  disabled={currentPolygonPoints.length === 0}
                  style={{ padding: "6px 14px", background: "#F3F4F6", color: "#444", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, cursor: currentPolygonPoints.length === 0 ? "not-allowed" : "pointer" }}
                >
                  ↩️ ยกเลิกจุดล่าสุด (กด r)
                </button>
                <button
                  onClick={cancelCurrentPolygon}
                  disabled={currentPolygonPoints.length === 0}
                  style={{ padding: "6px 14px", background: "#FEF2F2", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 8, fontSize: 13, cursor: currentPolygonPoints.length === 0 ? "not-allowed" : "pointer" }}
                >
                  🗑️ ยกเลิก Polygon นี้ (Esc)
                </button>
              </div>
            )}

            {/* 🔍 แถบควบคุมซูม canvas (Ctrl+scroll, ลากแถบเลื่อน หรือกดปุ่มก็ได้) */}
            {capturedImage && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "#475569", flexWrap: "wrap" }}>
                <span style={{ minWidth: 62 }}>🔍 ซูม: {Math.round(zoomLevel * 100)}%</span>
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
                >รีเซ็ต</button>
                <button
                  onClick={() => setZoomLevel(z => {
                    const next = Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2)));
                    setPanOffset(prev => clampPanOffset(prev, next));
                    return next;
                  })}
                  disabled={zoomLevel >= MAX_ZOOM}
                  style={{ width: 26, height: 26, flexShrink: 0, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: zoomLevel >= MAX_ZOOM ? "not-allowed" : "pointer", color: "#444" }}
                >+</button>
                <span style={{ color: "#94A3B8", flexBasis: "100%" }}>(หรือกด Ctrl ค้างแล้วหมุนเมาส์บนรูป, ปุ่มกลางเมาส์ค้างแล้วลากเพื่อเลื่อนภาพ)</span>
              </div>
            )}

            {/* ⌨️ Hint คีย์ลัดที่ใช้ได้บน Interactive Canvas */}
            {capturedImage && (
              <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 6, marginBottom: 0 }}>
                ⌨️ Ctrl+Z: ย้อนกลับ 1 ขั้นตอนล่าสุด &nbsp;|&nbsp; คลิกขวาบนกล่อง/Polygon: ลบทันที (เช็คทั้งสองแบบไม่ว่าจะเลือกโหมดไหนอยู่) &nbsp;|&nbsp; Ctrl+scroll: ซูม &nbsp;|&nbsp; ซูมแล้วใช้แถบเลื่อนขึ้น-ลง/ซ้าย-ขวา (หรือปุ่มกลางเมาส์ค้าง+ลาก) เพื่อดูส่วนอื่นของภาพ
                {isSegmentation && " | ลากจุด Polygon ที่วาดแล้ว: ย้ายตำแหน่งจุด | กำลังวาด Polygon: กด r ถอยจุดล่าสุด, Esc ยกเลิกทั้งรูป"}
              </p>
            )}
          </div>

          {capturedImage && (
            <div style={{ marginTop: 15, background: "#F8FAFC", padding: 12, borderRadius: 10, border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: "bold", color: "#475569", fontSize: 14 }}>🔄 สั่งทำ Augmentation ที่ฝั่ง Server:</span>
              <select
                value={augMode}
                onChange={(e) => handleAugModeChange(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff", fontWeight: "bold", color: "#0078D7", cursor: "pointer", width: "45%" }}
              >
                <option value="original">📦 Original (บันทึกภาพปกติ){savedModes.includes("original") ? " ✅" : ""}</option>
                <option value="rotation_-10">↩️ Server Auto Rotation -10°{savedModes.includes("rotation_-10") ? " ✅" : ""}</option>
                <option value="rotation_10">↪️ Server Auto Rotation 10°{savedModes.includes("rotation_10") ? " ✅" : ""}</option>
                <option value="zoom_in">🔍 Server Auto Zoom In{savedModes.includes("zoom_in") ? " ✅" : ""}</option>
                <option value="flip_horizontal">🔀 Server Auto Flip Horizontal{savedModes.includes("flip_horizontal") ? " ✅" : ""}</option>
                <option value="brightness_dark">🌙 Server Auto Reduce Brightness{savedModes.includes("brightness_dark") ? " ✅" : ""}</option>
                <option value="brightness_bright">☀️ Server Auto Increase Brightness{savedModes.includes("brightness_bright") ? " ✅" : ""}</option>
                <option value="grayscale">⚫ Server Auto Grayscale{savedModes.includes("grayscale") ? " ✅" : ""}</option>
                <option value="blur">💧 Server Auto Blur{savedModes.includes("blur") ? " ✅" : ""}</option>
                <option value="contrast_low">🔅 Server Auto Contrast Low{savedModes.includes("contrast_low") ? " ✅" : ""}</option>
                <option value="contrast_high">🔆 Server Auto Contrast High{savedModes.includes("contrast_high") ? " ✅" : ""}</option>
                <option value="saturation_low">🎨 Server Auto Saturation Low{savedModes.includes("saturation_low") ? " ✅" : ""}</option>
                <option value="saturation_high">🌈 Server Auto Saturation High{savedModes.includes("saturation_high") ? " ✅" : ""}</option>
              </select>
            </div>
          )}
        </div>

      </div>

      {/* แผงแสดงความพร้อมข้อมูล */}
      <div style={{ background: status.bg, border: `1px solid ${status.color}`, padding: "15px 20px", borderRadius: 12, marginBottom: 25 }}>
        <div style={{ fontWeight: "bold", color: status.color, fontSize: 15, marginBottom: 8 }}>
          {status.text}
        </div>
        <div style={{ width: "100%", height: 10, background: "#E2E8F0", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ width: `${status.percent}%`, height: "100%", background: status.color, borderRadius: 5, transition: "width 0.5s ease" }} />
        </div>
      </div>

      {/* แผงแสดงรายการ annotation + ปุ่มบันทึก */}
      <div style={{ background: "#fff", padding: 20, borderRadius: 15, border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
          <h3 style={{ margin: 0 }}>
            📊 รายการ Annotation รูปภาพนี้ ({boxes.length} กล่อง, {polygons.length} polygon)
          </h3>
          <button
            disabled={saveDisabled}
            style={{ padding: "10px 20px", background: saveDisabled ? "#ccc" : "#0078D7", color: "white", border: "none", borderRadius: 8, fontWeight: "bold", cursor: saveDisabled ? "not-allowed" : "pointer" }}
            onClick={saveImageToDataset}
            title={isCurrentModeSaved ? "โหมดนี้ถูกบันทึกไปแล้วสำหรับภาพนี้ กรุณาเลือกโหมดอื่นก่อนบันทึก" : ""}
          >
            {isCurrentModeSaved ? `✅ บันทึกโหมด [${augMode}] แล้ว` : (isSubmitting ? "⌛ กำลังอัปโหลด..." : `💾 บันทึกรูปภาพโหมด [${augMode}]`)}
          </button>
        </div>

        {boxes.length === 0 && polygons.length === 0 ? (
          <p style={{ color: "#aaa", textAlign: "center", padding: "10px 0" }}>ยังไม่มี Bounding Box หรือ Polygon ใด ๆ ถูกวาดในรูปปัจจุบันนี้</p>
        ) : (
          <>
            {boxes.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: "#666", margin: "0 0 10px" }}>🟧 Bounding Box ({boxes.length})</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: polygons.length > 0 ? 20 : 0 }}>
                  {boxes.map((box, index) => (
                    <div key={box.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", padding: "12px 15px", borderRadius: 8 }}>
                      <div>
                        <strong style={{ color: "#666" }}>กล่องที่ #{index + 1}</strong>
                        <div style={{ marginTop: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: "#444" }}>คลาส:</span>
                          <input
                            type="text"
                            value={box.label}
                            onChange={(e) => handleLabelChange(box.id, e.target.value)}
                            style={{ marginLeft: 8, padding: "3px 8px", border: "1px solid #cbd5e1", borderRadius: 5, fontWeight: "bold", color: "#E28743", width: "120px" }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: "#888" }}>
                          X: {Math.round(box.x)} | Y: {Math.round(box.y)} | W: {Math.round(box.w)} | H: {Math.round(box.h)}
                        </div>
                      </div>
                      <button onClick={() => deleteBox(box.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: 5 }} title="ลบกล่องนี้">❌</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {polygons.length > 0 && (
              <>
                <h4 style={{ fontSize: 14, color: "#666", margin: "0 0 10px" }}>⬡ Polygon ({polygons.length})</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {polygons.map((poly, index) => (
                    <div key={poly.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", padding: "12px 15px", borderRadius: 8 }}>
                      <div>
                        <strong style={{ color: "#666" }}>Polygon #{index + 1}</strong>
                        <div style={{ marginTop: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: "#444" }}>คลาส:</span>
                          <input
                            type="text"
                            value={poly.label}
                            onChange={(e) => handlePolygonLabelChange(poly.id, e.target.value)}
                            style={{ marginLeft: 8, padding: "3px 8px", border: "1px solid #cbd5e1", borderRadius: 5, fontWeight: "bold", color: "#E28743", width: "120px" }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: "#888" }}>
                          จำนวนจุด: {poly.points.length}
                        </div>
                      </div>
                      <button onClick={() => deletePolygon(poly.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: 5 }} title="ลบ Polygon นี้">❌</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

    </div>
  );
}
