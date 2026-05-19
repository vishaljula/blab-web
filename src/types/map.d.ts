/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "react-map-gl/mapbox" {
  import type { FC, Ref, ReactNode, CSSProperties } from "react";

  export interface ViewState {
    latitude: number;
    longitude: number;
    zoom: number;
    bearing?: number;
    pitch?: number;
  }

  export interface ViewStateChangeEvent {
    viewState: ViewState;
    target: any;
  }

  export interface MapRef {
    getMap(): mapboxgl.Map;
    fitBounds(bounds: [[number, number], [number, number]], options?: any): void;
  }

  export interface MapProps {
    ref?: Ref<MapRef>;
    mapboxAccessToken?: string;
    initialViewState?: Partial<ViewState>;
    style?: CSSProperties;
    mapStyle?: string;
    onMoveEnd?: (evt: ViewStateChangeEvent) => void;
    onLoad?: () => void;
    onClick?: (evt: any) => void;
    attributionControl?: boolean;
    reuseMaps?: boolean;
    children?: ReactNode;
    [key: string]: any;
  }

  export interface MarkerProps {
    longitude: number;
    latitude: number;
    anchor?: string;
    onClick?: (evt: { originalEvent: MouseEvent }) => void;
    children?: ReactNode;
    [key: string]: any;
  }

  export interface NavigationControlProps {
    position?: string;
    showCompass?: boolean;
    showZoom?: boolean;
  }

  export interface GeolocateControlProps {
    position?: string;
    trackUserLocation?: boolean;
    showAccuracyCircle?: boolean;
  }

  export function useMap(): { current: MapRef | undefined };

  const Map: FC<MapProps>;
  export default Map;
  export const Marker: FC<MarkerProps>;
  export const NavigationControl: FC<NavigationControlProps>;
  export const GeolocateControl: FC<GeolocateControlProps>;
}

declare module "@mapbox/mapbox-gl-draw" {
  interface DrawOptions {
    displayControlsDefault?: boolean;
    controls?: Record<string, boolean>;
    defaultMode?: string;
    styles?: any[];
  }

  class MapboxDraw {
    constructor(options?: DrawOptions);
    onAdd(map: any): HTMLElement;
    onRemove(map: any): void;
    deleteAll(): this;
    getAll(): GeoJSON.FeatureCollection;
    changeMode(mode: string): this;
  }

  export default MapboxDraw;
}

declare module "supercluster" {
  namespace Supercluster {
    interface Options {
      radius?: number;
      maxZoom?: number;
      minZoom?: number;
    }

    interface PointFeature<P> {
      type: "Feature";
      geometry: { type: "Point"; coordinates: [number, number] };
      properties: P;
    }

    interface ClusterFeature {
      type: "Feature";
      id?: number;
      geometry: { type: "Point"; coordinates: [number, number] };
      properties: {
        cluster: boolean;
        cluster_id?: number;
        point_count?: number;
        [key: string]: any;
      };
    }
  }

  class Supercluster<P = any> {
    constructor(options?: Supercluster.Options);
    load(points: Supercluster.PointFeature<P>[]): this;
    getClusters(
      bbox: [number, number, number, number],
      zoom: number
    ): (Supercluster.ClusterFeature | Supercluster.PointFeature<P>)[];
    getClusterExpansionZoom(clusterId: number): number;
  }

  export = Supercluster;
}
