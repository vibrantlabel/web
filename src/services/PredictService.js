// src/services/PredictService.js

import * as tf from "@tensorflow/tfjs-tflite";

let model = null;

export async function loadModel() {

  if (model)
    return model;

  model =
    await tf.loadTFLiteModel(
      "/model.tflite"
    );

  return model;
}

export async function predictCanvas(
  canvas
) {

  const model =
    await loadModel();

  const tensor =
    tf.browser
      .fromPixels(canvas)
      .resizeBilinear([224,224])
      .toFloat()
      .div(255)
      .expandDims(0);

  const output =
    model.predict(tensor);

  const scores =
    await output.data();

  tensor.dispose();
  output.dispose();

  return scores;
}