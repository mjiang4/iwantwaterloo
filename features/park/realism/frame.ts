import { Matrix4, Vector3 } from 'three';
/** ECEF metres -> park units: east +X, up +Y, south +Z, 30 metres per unit. */
export function parkFrame(
  latitude: number,
  longitude: number,
  elevation: number,
) {
  const lat = (latitude * Math.PI) / 180,
    lon = (longitude * Math.PI) / 180;
  const a = 6378137,
    eccentricitySquared = 6.69437999014e-3;
  const n = a / Math.sqrt(1 - eccentricitySquared * Math.sin(lat) ** 2);
  const origin = new Vector3(
    (n + elevation) * Math.cos(lat) * Math.cos(lon),
    (n + elevation) * Math.cos(lat) * Math.sin(lon),
    (n * (1 - eccentricitySquared) + elevation) * Math.sin(lat),
  );
  const east = new Vector3(-Math.sin(lon), Math.cos(lon), 0);
  const up = new Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  );
  const south = new Vector3(
    Math.sin(lat) * Math.cos(lon),
    Math.sin(lat) * Math.sin(lon),
    -Math.cos(lat),
  );
  const localToEarth = new Matrix4()
    .makeBasis(east, up, south)
    .setPosition(origin);
  return {
    localToEarth,
    earthToPark: new Matrix4()
      .makeScale(1 / 30, 1 / 30, 1 / 30)
      .multiply(localToEarth.clone().invert()),
  };
}
