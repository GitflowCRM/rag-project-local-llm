import {
  createDirectus,
  createItem,
  deleteItem,
  readItem,
  readItems,
  rest,
  staticToken,
  updateItem,
  deleteItems,
  updateItems,
  readFolders,
  createFolder,
  deleteFolder,
  readFile,
  readUsers,
} from '@directus/sdk';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function sanitizeLogData(data: any) {
  try {
    return JSON.stringify(data);
  } catch {
    return '[Unserializable]';
  }
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error && 'message' in error) {
    return (error as { message: string }).message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '[Unknown error]';
}

function getErrorStack(error: unknown): string | undefined {
  if (typeof error === 'object' && error && 'stack' in error) {
    return (error as { stack: string }).stack;
  }
  return undefined;
}

@Injectable()
export class CMSService {
  private readonly logger = new Logger(CMSService.name);
  constructor(private readonly configService: ConfigService) {}

  getClient() {
    const DIRECTUS_URL = this.configService.get<string>('CMS_ORIGIN_URL');
    const STATIC_TOKEN = this.configService.get<string>('CMS_STATIC_TOKEN');

    return createDirectus(DIRECTUS_URL)
      .with(staticToken(STATIC_TOKEN))
      .with(
        rest({
          onRequest: (options) => ({ ...options, cache: 'default' }),
        }),
      );
  }

  async get(collection: string, id: string, fields: string[] = ['*.*']) {
    this.logger.log(
      `Fetching item from collection ${collection} with id ${id}`,
    );
    try {
      const item = await this.getClient().request(
        readItem(collection, id, {
          fields: fields,
        }),
      );
      return item;
    } catch (error) {
      this.logger.error(
        `Error fetching item from collection ${collection} with id ${id}: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async getItems(
    collection: string,
    fields: string[] = ['*.*'],
    filter: Record<string, unknown> = {},
    limit: number = 10,
    page: number = 1,
  ): Promise<any[]> {
    this.logger.log(
      `Fetching items from collection ${collection} with filter ${JSON.stringify(filter)}`,
    );
    try {
      const items = await this.getClient().request(
        readItems(collection, {
          fields: fields,
          filter: filter,
          limit: limit,
          page: page,
        }),
      );
      return items;
    } catch (error) {
      this.logger.error(
        `Error fetching items from collection ${collection}: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async getItemsWithFilter(
    collection: string,
    filter: Record<string, unknown>,
    fields: string[] = ['*.*'],
  ) {
    this.logger.log(
      `Fetching items from collection ${collection} with filter ${JSON.stringify(filter)}`,
    );
    try {
      const items = await this.getClient().request(
        readItems(collection, {
          fields: fields,
          filter,
        }),
      );
      return items;
    } catch (error) {
      this.logger.error(
        `Error fetching items from collection ${collection} with filter ${JSON.stringify(filter)}: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async getItemDetails(
    collection: string,
    id: number,
    fields: string[] = ['*.*'],
  ) {
    this.logger.log(
      `Fetching item from collection ${collection} with id ${id}`,
    );
    try {
      const item = await this.getClient().request(
        readItem(collection, id, {
          fields: fields,
        }),
      );
      return item;
    } catch (error) {
      this.logger.error(
        `Error fetching item from collection ${collection} with id ${id}: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async create(collection: string, data: any) {
    this.logger.log(
      `Creating item in collection ${collection} with data ${sanitizeLogData(data)}`,
    );
    try {
      const item = await this.getClient().request(
        createItem(collection, data as unknown as Record<string, unknown>, {
          fields: ['*.*'],
        }),
      );
      return item;
    } catch (error) {
      this.logger.error(
        `Error creating item in collection ${collection}: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async update(collection: string, id: number, data: any) {
    this.logger.log(`Updating item in collection ${collection} with id ${id}}`);
    this.logger.debug(`Data: ${JSON.stringify(data)}`);
    try {
      const item = await this.getClient().request(
        updateItem(collection, id, data as unknown as Record<string, unknown>),
      );
      return item;
    } catch (error) {
      this.logger.error(
        `Error updating item in collection ${collection} with id ${id}: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      this.logger.error(JSON.stringify(error));
      throw error;
    }
  }

  async updateAll(
    collection: string,
    filter: Record<string, unknown>,
    data: any,
  ) {
    this.logger.log(
      `Updating items in collection ${collection} with filter ${JSON.stringify(filter)} and data ${JSON.stringify(data)}`,
    );
    try {
      const items = await this.getClient().request(
        updateItems(
          collection,
          filter,
          data as unknown as Record<string, unknown>,
        ),
      );
      return items;
    } catch (error) {
      this.logger.error(
        `Error updating items in collection ${collection} with filter ${JSON.stringify(filter)}: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async delete(collection: string, id: number) {
    this.logger.log(
      `Deleting item from collection ${collection} with id ${id}`,
    );
    try {
      const result = await this.getClient().request(deleteItem(collection, id));
      return result;
    } catch (error) {
      this.logger.error(
        `Error deleting item from collection ${collection} with id ${id}: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async deleteAll(collection: string, filter: Record<string, unknown>) {
    this.logger.log(
      `Deleting items from collection ${collection} with filter ${JSON.stringify(filter)}`,
    );
    try {
      const result = await this.getClient().request(
        deleteItems(collection, { filter }),
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Error deleting items from collection ${collection} with filter ${JSON.stringify(filter)}: ${getErrorMessage(error)}`,
        getErrorStack(error),
      );
      throw error;
    }
  }

  async getImage(id: string) {
    const image = await this.getClient().request(
      readFile(id, {
        fields: ['*.*'],
      }),
    );
    return image;
  }

  async getFolders(name?: string) {
    const filter = {};

    if (name) {
      filter['name'] = {
        _eq: name,
      };
    }

    const folders = await this.getClient().request(
      readFolders({
        filter,
      }),
    );
    return folders;
  }

  async createImageDirectory(name: string, parentId?: string) {
    const filter = {
      name: {
        _eq: name,
      },
    };

    if (parentId) {
      filter['parent'] = {
        _eq: parentId,
      };
    }

    const folders = await this.getClient().request(
      readFolders({
        filter,
      }),
    );

    if (folders.length > 0) {
      throw new BadRequestException('Folder already exists');
    }

    const imageDirectory = await this.getClient().request(
      createFolder({
        name: name,
        parent: parentId || null,
      }),
    );
    return imageDirectory;
  }

  async removeDirectory(name: string) {
    const list = await this.getClient().request(
      readFolders({
        filter: {
          name: {
            _eq: name,
          },
        },
      }),
    );

    if (list.length === 0) {
      return null;
    }

    for (const folder of list) {
      try {
        await this.getClient().request(deleteFolder(folder.id as string));
      } catch (error) {
        this.logger.error(
          `Error deleting folder ${folder.id}: ${getErrorMessage(error)}`,
          getErrorStack(error),
        );
      }
    }
  }

  async getUser(emailId: string) {
    if (!emailId) {
      throw new BadRequestException('Email Id is required');
    }
    const filter = {
      email: {
        _eq: emailId,
      },
    };

    return this.getClient().request(
      readUsers({
        filter: filter,
        fields: ['*.*.*'],
      }),
    );
  }
}
