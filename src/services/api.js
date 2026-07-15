import AppConfig
from "../config/AppConfig";

export async function getProjects() {

  const response = await fetch(

    `${AppConfig.ServerUrl}/get_projects`,

    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({

        deviceId:
          AppConfig.DeviceId

      })

    }

  );

  return await response.json();
}