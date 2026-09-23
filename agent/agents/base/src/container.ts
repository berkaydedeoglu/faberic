import "reflect-metadata";
import { container, type DependencyContainer } from "tsyringe";

export function buildContainer(): DependencyContainer {
  return container;
}
