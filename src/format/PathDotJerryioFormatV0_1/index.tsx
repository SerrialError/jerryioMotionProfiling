import { makeAutoObservable } from "mobx";
import { MainApp, getAppStores } from "@core/MainApp";
import { makeId } from "@core/Util";
import { Quantity, UnitConverter, UnitOfLength } from "@core/Unit";
import { GeneralConfig, convertFormat } from "../Config";
import { Format, importPDJDataFromTextFile } from "../Format";
import { PointCalculationResult, getPathPoints } from "@core/Calculation";
import { Path, Segment } from "@core/Path";
import { isCoordinateWithHeading } from "@core/Coordinate";
import { GeneralConfigImpl } from "./GeneralConfig";
import { PathConfigImpl, PathConfigPanel } from "./PathConfig";
import { UserInterface } from "@core/Layout";

// observable class
export class PathDotJerryioFormatV0_1 implements Format {
  isInit: boolean = false;
  uid: string;

  private gc = new GeneralConfigImpl(this);

  private readonly disposers: (() => void)[] = [];

  constructor() {
    this.uid = makeId(10);
    makeAutoObservable(this);
  }

  createNewInstance(): Format {
    return new PathDotJerryioFormatV0_1();
  }

  getName(): string {
    return "path.jerryio v0.1";
  }

  getDescription(): string {
    return "The default and official format for path planning purposes and custom library. Output is in centimeters, rpm.";
  }

  register(app: MainApp, ui: UserInterface): void {
    if (this.isInit) return;
    this.isInit = true;

    this.disposers.push(ui.registerPanel(PathConfigPanel).disposer);
  }

  unregister(): void {
    this.disposers.forEach(disposer => disposer());
  }

  getGeneralConfig(): GeneralConfig {
    return this.gc;
  }

  createPath(...segments: Segment[]): Path {
    return new Path(new PathConfigImpl(this), ...segments);
  }

  getPathPoints(path: Path): PointCalculationResult {
    return getPathPoints(path, new Quantity(this.gc.pointDensity, this.gc.uol));
  }

  convertFromFormat(oldFormat: Format, oldPaths: Path[]): Path[] {
    return convertFormat(this, oldFormat, oldPaths);
  }

  importPathsFromFile(buffer: ArrayBuffer): Path[] {
    throw new Error("Unable to import paths from this format, try other formats?");
  }

  importPDJDataFromFile(buffer: ArrayBuffer): Record<string, any> | undefined {
    return importPDJDataFromTextFile(buffer);
  }

  exportFile(): ArrayBufferView<ArrayBufferLike> {
    const { app } = getAppStores();

    let fileContent = "";

    const uc = new UnitConverter(app.gc.uol, UnitOfLength.Meter);
    const uc_linear = new UnitConverter(app.gc.uol, UnitOfLength.Inch);
    const density = new Quantity(app.gc.pointDensity, app.gc.uol);

for (const path of app.paths) {
  fileContent += `#PATH-START ${path.name}`;

  const points = getPathPoints(path, density).points;

  for (const segment of path.segments) {
    const relatedPoints = points.filter(point => point.sampleRef === segment);
    
    if (segment.isCubic()) {
      fileContent += `\n#POINTS-START \n`;
      // Control Points Formatting
      const controlLines = [...segment.controls].map(
        control => `${uc.fromAtoB(control.x).toUser()}, ${uc.fromAtoB(control.y).toUser()}`
      );
      fileContent += controlLines.join("\n");

      // Check if all except the last velocity are 5.4
      const allButLastAreStatic = relatedPoints.length > 1 &&
        relatedPoints.slice(0, -1).every(point => point.speed.toUser() === 5.4);

      // Key Frame Velocity List Formatting
      fileContent += `\n#VELOCITIES-START \n`;
      if (allButLastAreStatic) {
        fileContent += "0, 0, 0";
      } else {
        const velocityLines = relatedPoints.map(
          point => `${uc.fromAtoB(point.x).toUser()}, ${uc.fromAtoB(point.y).toUser()}, ${point.speed.toUser()}`
        );
        fileContent += velocityLines.join("\n");
      }
    } else {
		const end = segment.controls[segment.controls.length - 1];
      fileContent += `moveToPoint(${uc_linear.fromAtoB(end.x).toUser()}, ${uc_linear.fromAtoB(end.y).toUser()}, 2000);\n`;
	
    }
  }

}

	fileContent += "\n#PATH.JERRYIO-DATA " + JSON.stringify(app.exportPDJData());

    return new TextEncoder().encode(fileContent);
  }
}
