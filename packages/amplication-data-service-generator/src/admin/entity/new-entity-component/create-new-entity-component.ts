import * as path from "path";
import { builders, namedTypes } from "ast-types";
import { Entity, EnumDataType, EntityField } from "../../../types";
import {
  addImports,
  importContainedIdentifiers,
  importNames,
  interpolate,
} from "../../../util/ast";
import { readFile, relativeImportPath } from "../../../util/module";
import { DTOs } from "../../../server/resource/create-dtos";
import { EntityComponent } from "../../types";
import { createFieldInput } from "../create-field-input";
import { jsxFragment } from "../../util";

const template = path.resolve(__dirname, "new-entity-component.template.tsx");

const IMPORTABLE_IDS = {
  "../user/RoleSelect": [builders.identifier("RoleSelect")],
  "@amplication/design-system": [
    builders.identifier("TextField"),
    builders.identifier("SelectField"),
    builders.identifier("ToggleField"),
  ],
};

export async function createNewEntityComponent(
  entity: Entity,
  dtos: DTOs,
  entityToDirectory: Record<string, string>,
  entityToPath: Record<string, string>,
  entityToResource: Record<string, string>,
  dtoNameToPath: Record<string, string>,
  entityToSelectComponent: Record<string, EntityComponent>
): Promise<EntityComponent> {
  const file = await readFile(template);
  const name = `Create${entity.name}`;
  const modulePath = `${entityToDirectory[entity.name]}/${name}.tsx`;
  const entityDTO = dtos[entity.name].entity;
  const dto = dtos[entity.name].createInput;
  const path = entityToPath[entity.name];
  const resource = entityToResource[entity.name];
  const dtoProperties = dto.body.body.filter(
    (
      member
    ): member is namedTypes.ClassProperty & { key: namedTypes.Identifier } =>
      namedTypes.ClassProperty.check(member) &&
      namedTypes.Identifier.check(member.key)
  );
  const fieldsByName = Object.fromEntries(
    entity.fields.map((field) => [field.name, field])
  );
  const fields = dtoProperties.map(
    (property) => fieldsByName[property.key.name]
  );
  const relationFields: EntityField[] = fields.filter(
    (field) => field.dataType === EnumDataType.Lookup
  );
  const localEntityDTOId = builders.identifier(`T${entityDTO.id.name}`);

  interpolate(file, {
    COMPONENT_NAME: builders.identifier(name),
    ENTITY_NAME: builders.stringLiteral(entity.displayName),
    PATH: builders.stringLiteral(path),
    RESOURCE: builders.stringLiteral(resource),
    ENTITY: localEntityDTOId,
    CREATE_INPUT: dto.id,
    INPUTS: jsxFragment`<>${fields.map((field) => {
      return createFieldInput(field, entityToSelectComponent);
    })}</>`,
  });

  // Add imports for entities select components
  addImports(
    file,
    relationFields.map((field) => {
      const { relatedEntity } = field.properties;
      const relatedEntitySelectComponent =
        entityToSelectComponent[relatedEntity.name];
      return importNames(
        [builders.identifier(relatedEntitySelectComponent.name)],
        relativeImportPath(modulePath, relatedEntitySelectComponent.modulePath)
      );
    })
  );

  addImports(file, [
    builders.importDeclaration(
      [builders.importSpecifier(entityDTO.id, localEntityDTOId)],
      builders.stringLiteral(
        relativeImportPath(modulePath, dtoNameToPath[entityDTO.id.name])
      )
    ),
    importNames(
      [dto.id],
      relativeImportPath(modulePath, dtoNameToPath[dto.id.name])
    ),
    ...importContainedIdentifiers(file, IMPORTABLE_IDS),
  ]);

  return { name, file, modulePath };
}
