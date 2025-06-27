import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { Response } from 'express';

export interface UiGenerationRequest {
  query: string;
  context?: string;
  style?: string;
  layout?: string;
  components?: string[];
  maxResults?: number;
}

export interface UiGenerationResponse {
  uiCode: string;
  explanation: string;
  components: string[];
  layout: string;
  style: string;
  confidence: number;
  sources: Array<{
    blockId: string;
    summary: string;
    relevance: number;
  }>;
}

export interface VendorBlock {
  id: string;
  config: Record<string, unknown> | Array<Record<string, unknown>>;
  ui_block: {
    block_id: string;
  };
  theme: {
    niche: string;
    id: string;
    title: string;
  };
}

interface UiMetadata {
  components: string[];
  layout: string;
  style: string;
  explanation: string;
}

@Injectable()
export class UiGenerationService {
  private readonly logger = new Logger(UiGenerationService.name);

  // Pre-generated vendor blocks data
  private readonly vendorBlocks: VendorBlock[] = [
    {
      id: '196',
      config: {
        logoUrl:
          'https://cms.buildappify.com/assets/94945424-7c2d-4c04-9497-18f0b162cf70.png',
        type: 'splash',
      },
      ui_block: {
        block_id: 'splash_screen',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '197',
      config: {
        id: '197',
        type: 'colorScheme',
        primaryButtonColor: '#008060',
        accentColor: '#008060',
        screenBackground: '#000000',
        cardBackground: '#ffffff',
        textColor: '#202223',
      },
      ui_block: {
        block_id: 'color_scheme',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '246',
      config: [
        {
          name: 'Unisex',
          icon: 'HomeIcon',
          id: 'new-1747295848116-fe8a1b46b26a18',
          subItems: [],
          config: {
            type: 'collection',
            navigationType: 'collection',
            collectionTargetImage: '',
            targetCollectionName: 'Unisex',
            navigationTarget: 'gid://shopify/Collection/301639368843',
          },
        },
        {
          name: 'T-Shirts',
          icon: 'HandHelping',
          config: {
            type: 'collection',
            navigationType: 'collection',
            targetCollectionName: 'TSHIRTS',
            navigationTarget: 'gid://shopify/Collection/299105288331',
          },
          id: 'new-1748373090948-e3e9d144e39128',
          subItems: [],
        },
        {
          name: "Children's Wear",
          icon: 'HomeIcon',
          config: {
            type: 'collection',
            navigationType: 'collection',
            collectionTargetImage: '',
            targetCollectionName: "Children's Wear",
            navigationTarget: 'gid://shopify/Collection/301638025355',
          },
          id: 'new-1749680000024-b209495cfab01',
          subItems: [],
        },
        {
          name: 'All Products',
          icon: 'HomeIcon',
          config: {
            type: 'screen',
            navigationType: 'page',
            navigationTarget: 'products',
          },
          id: 'new-1749680035227-6ad174991fe2d8',
          subItems: [],
        },
      ],
      ui_block: {
        block_id: 'navigation_sidebar',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '247',
      config: [
        {
          id: '1',
          name: 'Home',
          icon: 'HomeIcon',
          navigationType: 'home',
          navigationTarget: null,
          subItems: [],
        },
        {
          name: 'Product',
          icon: 'HomeIcon',
          navigationType: 'home',
          navigationTarget: null,
          id: 'new-1748870621233-808e2595e76fe8',
          subItems: [],
        },
        {
          id: '3',
          name: 'Cart',
          icon: 'ShoppingCartIcon',
          navigationType: 'home',
          navigationTarget: null,
          subItems: [],
        },
        {
          id: '4',
          name: 'WishList',
          icon: 'HeartIcon',
          navigationType: 'home',
          navigationTarget: null,
          subItems: [],
        },
        {
          id: 'new-1748869098102-0f2388f15dafd',
          name: 'Account',
          icon: 'PersonIcon',
          navigationType: 'home',
          navigationTarget: null,
          subItems: [],
        },
      ],
      ui_block: {
        block_id: 'navigation_bottom_tab',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '270',
      config: {
        showWishlistIcon: true,
        showAddToCart: false,
        showQuantitySelector: true,
        addToCartText: 'Buy Now',
        product: null,
      },
      ui_block: {
        block_id: 'product_details_basic',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '276',
      config: {
        title: 'Logitech MX ',
        image:
          'https://cms.buildappify.com/assets/0bb802ba-1470-400e-bc80-8ae42068ceb7.png',
        subtitle:
          'Logitech MX Mechanical Mini Wireless Illuminated Keyboard, Clicky Switches, Backlit, Bluetooth, USB-C, macOS,',
      },
      ui_block: {
        block_id: 'cart_empty',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '277',
      config: {
        imageFit: 'stretch',
        showCollectionName: true,
      },
      ui_block: {
        block_id: 'collection_list',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '281',
      config: {
        showUserInfoCard: true,
        showManageAddresses: true,
        showAccountSecurity: true,
        showMyOrders: true,
        showMyProfile: true,
        showNotifications: true,
        showAppAppearance: true,
        showDataAnalytics: true,
        showHelpSupport: true,
        showLogoutButton: true,
      },
      ui_block: {
        block_id: 'account_screen',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '303',
      config: {
        id: '',
        title: 'TShirt',
        logoUrl:
          'https://cms.buildappify.com/assets/bb38f2cc-b4ff-4a1e-a746-562ff4a48fdc.png',
        logoType: 'image',
      },
      ui_block: {
        block_id: 'app_branding',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '409',
      config: [
        {
          image:
            'https://cms.buildappify.com/assets/00c2afe3-04f8-45ef-bf07-2d71121a6a10.png',
          resize: 'fill',
          navigateTo: null,
          navigationType: 'product',
          collectionTarget: null,
          productTarget: null,
          urlTarget: null,
          pageTarget: null,
          order: 1,
          imageUrl:
            'https://cms.buildappify.com/assets/00c2afe3-04f8-45ef-bf07-2d71121a6a10.png',
          title: 'Featured Product',
          subtitle: 'Discover our latest collection',
        },
        {
          image: '',
          resize: 'fit',
          navigateTo: null,
          navigationType: 'collection',
          collectionTarget: 'collection-id-1',
          productTarget: null,
          urlTarget: null,
          pageTarget: null,
          order: 2,
          title: 'New Arrivals',
          subtitle: 'Shop the latest trends',
        },
        {
          image: '',
          resize: 'stretch',
          navigateTo: null,
          navigationType: 'page',
          collectionTarget: null,
          productTarget: null,
          urlTarget: null,
          pageTarget: 'page-id-1',
          order: 3,
          title: 'Special Offers',
          subtitle: 'Limited time deals',
        },
        {
          image: '',
          resize: 'fit',
          navigateTo: null,
          navigationType: 'url',
          collectionTarget: null,
          productTarget: null,
          urlTarget: 'https://example.com',
          pageTarget: null,
          order: 4,
          title: 'Learn More',
          subtitle: 'Discover our story',
        },
      ],
      ui_block: {
        block_id: 'banner_slider',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '741',
      config: {
        layout: 'grid',
        showDiscount: true,
        products: [],
      },
      ui_block: {
        block_id: 'product_grid_new',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
    {
      id: '742',
      config: {
        title: 'Sample',
        banners: [
          {
            resize: 'fill',
            navigateTo: null,
            navigationType: null,
            collectionTarget: null,
            productTarget: null,
            urlTarget: null,
            pageTarget: null,
            order: 1,
            imageUrl: null,
            productTargetImage: null,
            collectionTargetImage: null,
            targetProductName: null,
            targetCollectionName: null,
          },
          {
            resize: 'fill',
            navigateTo: null,
            navigationType: null,
            collectionTarget: null,
            productTarget: null,
            urlTarget: null,
            pageTarget: null,
            order: 2,
            imageUrl: null,
            productTargetImage: null,
            collectionTargetImage: null,
            targetProductName: null,
            targetCollectionName: null,
          },
          {
            resize: 'fill',
            navigateTo: null,
            navigationType: null,
            collectionTarget: null,
            productTarget: null,
            urlTarget: null,
            pageTarget: null,
            order: 3,
            imageUrl: null,
            productTargetImage: null,
            collectionTargetImage: null,
            targetProductName: null,
            targetCollectionName: null,
          },
        ],
      },
      ui_block: {
        block_id: 'advanced_image_slider',
      },
      theme: {
        niche: 'Clothing',
        id: '6',
        title: 'Nimbus 2.0',
      },
    },
  ];

  constructor(private readonly llmService: LlmService) {}

  async generateUi(
    request: UiGenerationRequest,
  ): Promise<UiGenerationResponse> {
    this.logger.log(`Generating UI for query: ${request.query}`);

    const screenType = this.determineScreenType(request.query);
    this.logger.log(`Detected screen type: ${screenType}`);

    const relevantBlocks = this.selectRelevantBlocks(request, screenType);
    this.logger.log(`Selected ${relevantBlocks.length} relevant blocks`);

    const uiCode = await this.generateUiCode(
      request,
      relevantBlocks,
      screenType,
    );
    const metadata = await this.extractUiMetadata(uiCode);

    return {
      uiCode,
      explanation: metadata.explanation,
      components: metadata.components,
      layout: metadata.layout,
      style: metadata.style,
      confidence: this.calculateConfidence(relevantBlocks),
      sources: this.formatSources(relevantBlocks),
    };
  }

  async generateUiStream(
    request: UiGenerationRequest,
    res: Response,
  ): Promise<void> {
    this.logger.log(
      `Starting streaming UI generation for query: ${request.query}`,
    );

    try {
      // Send initial status
      res.write(
        `data: ${JSON.stringify({ type: 'status', message: 'Starting UI generation...' })}\n\n`,
      );

      const screenType = this.determineScreenType(request.query);
      res.write(
        `data: ${JSON.stringify({ type: 'progress', message: `Detected screen type: ${screenType}` })}\n\n`,
      );

      const relevantBlocks = this.selectRelevantBlocks(request, screenType);
      res.write(
        `data: ${JSON.stringify({ type: 'progress', message: `Selected ${relevantBlocks.length} relevant blocks` })}\n\n`,
      );

      // Generate UI code with streaming
      res.write(
        `data: ${JSON.stringify({ type: 'progress', message: 'Generating UI code...' })}\n\n`,
      );

      await this.generateUiCode(
        request,
        relevantBlocks,
        screenType,
        true, // Enable streaming
        res,
      );
    } catch (error) {
      this.logger.error(`Error in streaming UI generation: ${error}`);
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Unknown error occurred',
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  getSimilarBlocks(
    blockId: string,
    maxResults: number = 5,
  ): Array<{ blockId: string; description: string; relevance: number }> {
    try {
      const similarBlocks = this.vendorBlocks
        .filter((block) => block.ui_block.block_id !== blockId)
        .slice(0, maxResults)
        .map((block, index) => ({
          blockId: block.ui_block.block_id,
          description: `${block.ui_block.block_id} - ${block.theme.niche} theme`,
          relevance: 1 - index * 0.1, // Simple relevance scoring
        }));

      return similarBlocks;
    } catch (error) {
      this.logger.error(
        `Error finding similar blocks: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private selectRelevantBlocks(
    request: UiGenerationRequest,
    screenType: string,
  ): VendorBlock[] {
    // Filter blocks based on screen type and query
    const relevantBlocks = this.vendorBlocks.filter((block) => {
      const blockId = block.ui_block.block_id.toLowerCase();
      // const query = request.query.toLowerCase();

      // Screen type specific filtering
      switch (screenType) {
        case 'home':
        case 'fashion':
          return [
            'banner_slider',
            'product_grid_new',
            'advanced_image_slider',
          ].includes(blockId);

        case 'product':
          return [
            'product_details_basic',
            'navigation_bottom_tab',
            'app_branding',
            'color_scheme',
          ].includes(blockId);

        case 'checkout':
          return [
            'cart_empty',
            'navigation_bottom_tab',
            'app_branding',
            'color_scheme',
          ].includes(blockId);

        case 'profile':
          return [
            'account_screen',
            'navigation_bottom_tab',
            'app_branding',
            'color_scheme',
          ].includes(blockId);

        default:
          return true; // Include all blocks for general screens
      }
    });

    // Limit to requested max results
    return relevantBlocks.slice(0, request.maxResults || 10);
  }

  private async generateUiCode(
    request: UiGenerationRequest,
    relevantBlocks: VendorBlock[],
    screenType: string,
    stream: boolean = false,
    res?: Response,
  ): Promise<string> {
    const prompt = this.buildUiGenerationPrompt(
      request,
      relevantBlocks,
      screenType,
    );

    try {
      const result = await this.llmService.generateResponse({
        prompt,
        stream,
        res,
      });

      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
      this.logger.error(
        `Error generating UI code: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error('Failed to generate UI code');
    }
  }

  private buildUiGenerationPrompt(
    request: UiGenerationRequest,
    relevantBlocks: VendorBlock[],
    screenType: string,
  ): string {
    const contextParts = this.buildContextParts(request);
    const blockExamples = this.formatBlockExamples(relevantBlocks);
    const availableBlockIds = relevantBlocks
      .map((block) => block.ui_block.block_id)
      .join(', ');

    // Extract business context from the query
    const businessContext = this.extractBusinessContext(request.query);

    return `You are a UI layout assistant creating a ${screenType} screen for a ${businessContext}. You are given a specific user request and a set of available UI blocks/components.

**SPECIFIC USER REQUEST: "${request.query}"**

**BUSINESS CONTEXT: ${businessContext}**

${contextParts.join('\n')}

Screen Type: ${screenType}

**CRITICAL CONSTRAINTS:**
1. **Use ONLY these exact block IDs: ${availableBlockIds}**
2. **DO NOT create duplicate blocks** - each block_id should appear only once
3. **Use ONLY English content** - no other languages
4. **MODIFY existing configurations** - do not create new config structures
5. **Make content specific to ${businessContext}** - avoid generic content

Available UI Blocks with their current configurations:
${blockExamples}

**BUSINESS-SPECIFIC REQUIREMENTS FOR ${businessContext}:**
${this.getBusinessSpecificRequirements(businessContext)}

**BANNER SLIDER CUSTOMIZATION:**
- **Customize title and subtitle fields** for each banner to match ${businessContext}
- **Use business-specific messaging** in titles and subtitles
- **Make content relevant** to the specific business type
- **Avoid generic titles** like "Featured Product" - use specific business content

**INSTRUCTIONS:**
1. **Pay close attention to the specific user request above** - this is the primary requirement
2. **Consider the business context** - tailor the UI specifically for ${businessContext}
3. **Use ONLY the block IDs provided above** - DO NOT create new block IDs
4. **MODIFY the existing configurations** shown above to fit the specific business context
5. **Do NOT create new config structures** - use the existing config format and modify values within it
6. **Avoid duplicate blocks** - each block_id should be used only once
7. **Use realistic, business-specific content** that matches ${businessContext}

Screen-Specific Guidelines for ${businessContext}:

${this.getScreenSpecificGuidelines(screenType, businessContext)}

**OUTPUT REQUIREMENTS:**
- Use ONLY these block IDs: ${availableBlockIds}
- Each block_id should appear only once
- Use ONLY English content
- Make configurations contextually relevant to ${businessContext}
- Include realistic content specific to ${businessContext}

Output format:
{
  "ui_blocks": [
    {
      "block_id": "banner_slider",
      "description": "A dynamic banner slider for ${businessContext}.",
      "initialConfig": [
        {
          "image": "https://example.com/${businessContext.toLowerCase().replace(' ', '-')}-banner1.jpg",
          "resize": "fill",
          "navigateTo": "/collections/${businessContext.toLowerCase().replace(' ', '-')}",
          "navigationType": "collection",
          "collectionTarget": null,
          "productTarget": null,
          "urlTarget": null,
          "pageTarget": null,
          "order": 1,
          "imageUrl": "https://example.com/${businessContext.toLowerCase().replace(' ', '-')}-banner1.jpg"
        }
      ]
    }
  ]
}

**FINAL REMINDER:**
- Only use these block IDs: ${availableBlockIds}
- Each block_id should appear only once
- Use ONLY English content
- Make the UI specific to ${businessContext}
- Avoid generic or repetitive content

Generate the UI block definitions for this ${screenType} screen for ${businessContext}:`;
  }

  private extractBusinessContext(query: string): string {
    const lowerQuery = query.toLowerCase();

    // Extract business type from the query
    if (
      lowerQuery.includes('perfume') ||
      lowerQuery.includes('fragrance') ||
      lowerQuery.includes('cologne')
    ) {
      return 'Perfume Store';
    }
    if (
      lowerQuery.includes('fashion') ||
      lowerQuery.includes('clothing') ||
      lowerQuery.includes('apparel') ||
      lowerQuery.includes('shop')
    ) {
      return 'Fashion Shop';
    }
    if (
      lowerQuery.includes('electronics') ||
      lowerQuery.includes('tech') ||
      lowerQuery.includes('gadget')
    ) {
      return 'Electronics Store';
    }
    if (
      lowerQuery.includes('food') ||
      lowerQuery.includes('restaurant') ||
      lowerQuery.includes('cafe')
    ) {
      return 'Food & Beverage';
    }
    if (lowerQuery.includes('service') || lowerQuery.includes('booking')) {
      return 'Service Business';
    }
    if (lowerQuery.includes('book') || lowerQuery.includes('library')) {
      return 'Bookstore';
    }
    if (lowerQuery.includes('jewelry') || lowerQuery.includes('accessory')) {
      return 'Jewelry Store';
    }
    if (lowerQuery.includes('sport') || lowerQuery.includes('fitness')) {
      return 'Sports Store';
    }
    if (lowerQuery.includes('beauty') || lowerQuery.includes('cosmetic')) {
      return 'Beauty Store';
    }
    if (lowerQuery.includes('home') || lowerQuery.includes('furniture')) {
      return 'Home & Furniture';
    }

    return 'General Business';
  }

  private buildContextParts(request: UiGenerationRequest): string[] {
    const parts: string[] = [];

    if (request.context) {
      parts.push(`Additional Context: ${request.context}`);
    }
    if (request.style) {
      parts.push(`Style Preference: ${request.style}`);
    }
    if (request.layout) {
      parts.push(`Layout Preference: ${request.layout}`);
    }
    if (request.components?.length) {
      parts.push(`Required Components: ${request.components.join(', ')}`);
    }

    return parts;
  }

  private formatBlockExamples(blocks: VendorBlock[]): string {
    return blocks
      .map(
        (block, index) => `
${index + 1}. ${block.ui_block.block_id}
   Theme: ${block.theme.title} (${block.theme.niche})
   Current Config: ${JSON.stringify(block.config, null, 2)}`,
      )
      .join('\n');
  }

  private determineScreenType(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (
      lowerQuery.includes('home') ||
      lowerQuery.includes('landing') ||
      lowerQuery.includes('main')
    ) {
      return 'home';
    }
    if (
      lowerQuery.includes('product') ||
      lowerQuery.includes('catalog') ||
      lowerQuery.includes('shop')
    ) {
      return 'product';
    }
    if (
      lowerQuery.includes('checkout') ||
      lowerQuery.includes('cart') ||
      lowerQuery.includes('payment')
    ) {
      return 'checkout';
    }
    if (
      lowerQuery.includes('profile') ||
      lowerQuery.includes('account') ||
      lowerQuery.includes('user')
    ) {
      return 'profile';
    }
    if (lowerQuery.includes('collection') || lowerQuery.includes('category')) {
      return 'collection';
    }
    if (lowerQuery.includes('search') || lowerQuery.includes('filter')) {
      return 'search';
    }
    if (lowerQuery.includes('wishlist') || lowerQuery.includes('favorites')) {
      return 'wishlist';
    }
    if (
      lowerQuery.includes('fashion') ||
      lowerQuery.includes('clothing') ||
      lowerQuery.includes('apparel')
    ) {
      return 'fashion';
    }

    return 'general';
  }

  private getScreenSpecificGuidelines(
    screenType: string,
    businessContext: string,
  ): string {
    switch (screenType) {
      case 'home':
        return `Home Screen Guidelines for ${businessContext}:
- Start with hero/banner components showcasing ${businessContext.toLowerCase()} products/services
- Include navigation and search functionality specific to ${businessContext.toLowerCase()}
- Show featured ${businessContext.toLowerCase()} products or collections prominently
- Add category navigation relevant to ${businessContext.toLowerCase()}
- Include promotional content and announcements for ${businessContext.toLowerCase()}
- End with footer or additional navigation
- Use engaging visuals and clear call-to-actions for ${businessContext.toLowerCase()}`;

      case 'fashion':
        return `Fashion Home Screen Guidelines for ${businessContext}:
- Start with a stunning hero banner showcasing latest fashion trends
- Include fashion category navigation (Clothing, Accessories, Shoes, Bags)
- Show featured fashion collections with high-quality images
- Add seasonal promotions and fashion deals
- Include brand showcases and designer highlights
- Show trending fashion items or new arrivals
- Use fashion-appropriate colors and styling
- Include size guides or fashion tips`;

      case 'product':
        return `Product Screen Guidelines for ${businessContext}:
- Start with product images and gallery
- Include product details, pricing, and descriptions
- Add size/color selection options
- Show related products or recommendations
- Include reviews and ratings
- Add to cart and wishlist functionality
- Show product specifications and details
- Include shipping and return information`;

      case 'checkout':
        return `Checkout Screen Guidelines for ${businessContext}:
- Start with order summary and cart contents
- Include shipping address and delivery options
- Add payment method selection
- Show order confirmation and tracking
- Include security badges and trust indicators
- Add promotional codes and discounts
- Show estimated delivery times
- Include customer support information`;

      case 'profile':
        return `Profile Screen Guidelines for ${businessContext}:
- Start with user avatar and basic info
- Include order history and tracking
- Add account settings and preferences
- Show saved addresses and payment methods
- Include wishlist and favorites
- Add loyalty points or rewards
- Show recent activity and notifications
- Include logout and security options`;

      case 'collection':
        return `Collection Screen Guidelines for ${businessContext}:
- Start with collection banner and description
- Include product grid with filtering options
- Add sorting and view options
- Show collection-specific promotions
- Include related collections
- Add breadcrumb navigation
- Show collection size and availability
- Include collection-specific styling`;

      default:
        return `General Screen Guidelines for ${businessContext}:
- Create a logical flow from top to bottom
- Use appropriate components for the content type
- Ensure good visual hierarchy and spacing
- Include navigation and user interaction elements
- Make configurations contextually relevant to ${businessContext.toLowerCase()}
- Use engaging visuals and clear messaging for ${businessContext.toLowerCase()}`;
    }
  }

  private getBusinessSpecificRequirements(businessContext: string): string {
    switch (businessContext) {
      case 'Perfume Store':
        return `- Focus on luxury and elegance
- Include fragrance categories (Floral, Oriental, Woody, Fresh)
- Feature gift sets and luxury packaging
- Use sophisticated color schemes and premium imagery
- Include fragrance families and notes
- Emphasize exclusivity and premium quality
- Banner titles: "Luxury Fragrances", "Exclusive Collections", "Gift Sets", "Signature Scents"
- Banner subtitles: "Discover your signature scent", "Premium fragrances for every occasion", "Luxury gift collections"`;

      case 'Fashion Shop':
        return `- Focus on clothing categories and seasonal trends
- Include size guides and style recommendations
- Feature new arrivals and trending items
- Use fashion-forward imagery and styling
- Include seasonal collections and promotions
- Emphasize style and fashion trends
- Banner titles: "New Arrivals", "Seasonal Trends", "Style Guide", "Fashion Forward"
- Banner subtitles: "Shop the latest trends", "Discover your style", "Seasonal collections"`;

      case 'Electronics Store':
        return `- Focus on product categories and tech specs
- Include product reviews and ratings
- Feature latest technology and gadgets
- Use technical imagery and specifications
- Include warranty and support information
- Emphasize innovation and technology
- Banner titles: "Latest Tech", "Smart Devices", "Gaming Gear", "Home Tech"
- Banner subtitles: "Cutting-edge technology", "Innovation at your fingertips", "Smart home solutions"`;

      case 'Food & Beverage':
        return `- Focus on menu items and food categories
- Include delivery and pickup options
- Feature seasonal dishes and promotions
- Use appetizing food imagery
- Include dietary preferences and allergens
- Emphasize freshness and quality
- Banner titles: "Fresh Menu", "Seasonal Specials", "Quick Delivery", "Chef's Choice"
- Banner subtitles: "Fresh ingredients daily", "Delivered to your door", "Chef-inspired dishes"`;

      case 'Service Business':
        return `- Focus on service categories and booking
- Include contact information and locations
- Feature service packages and pricing
- Use professional service imagery
- Include testimonials and reviews
- Emphasize expertise and reliability
- Banner titles: "Our Services", "Expert Solutions", "Book Now", "Why Choose Us"
- Banner subtitles: "Professional expertise", "Reliable service", "Book your appointment"`;

      default:
        return `- Focus on the specific business type mentioned
- Include relevant categories and products
- Feature appropriate imagery and content
- Use business-appropriate styling
- Include relevant functionality
- Emphasize business-specific value propositions
- Banner titles: Use business-specific titles
- Banner subtitles: Use business-specific messaging`;
    }
  }

  private async extractUiMetadata(uiCode: string): Promise<UiMetadata> {
    const prompt = this.buildMetadataExtractionPrompt(uiCode);

    try {
      const result = await this.llmService.generateResponse({
        prompt,
        stream: false,
      });

      const response =
        typeof result === 'string' ? result : JSON.stringify(result);
      return this.parseMetadataResponse(response);
    } catch (error) {
      this.logger.error(
        `Error extracting UI metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.getDefaultMetadata();
    }
  }

  private buildMetadataExtractionPrompt(uiCode: string): string {
    return `Analyze the following UI block definitions and extract metadata:

UI Code:
${uiCode}

Extract and return a JSON object with:
- components: Array of component types used (e.g., ["header", "navigation", "hero", "cards"])
- layout: Layout type (e.g., "grid", "flexbox", "stack")
- style: Style approach (e.g., "modern", "minimal", "colorful", "dark")
- explanation: Brief explanation of the UI structure and design choices

Return only the JSON object:`;
  }

  private parseMetadataResponse(response: string): UiMetadata {
    try {
      const metadata = JSON.parse(response) as UiMetadata;
      return {
        components: Array.isArray(metadata.components)
          ? metadata.components
          : [],
        layout: metadata.layout || 'flexbox',
        style: metadata.style || 'modern',
        explanation:
          metadata.explanation || 'Generated UI based on user requirements',
      };
    } catch {
      return this.getDefaultMetadata();
    }
  }

  private getDefaultMetadata(): UiMetadata {
    return {
      components: [],
      layout: 'flexbox',
      style: 'modern',
      explanation: 'Generated UI based on user requirements',
    };
  }

  private calculateConfidence(relevantBlocks: VendorBlock[]): number {
    if (relevantBlocks.length === 0) {
      return 0.3;
    }

    // Simple confidence calculation based on number of relevant blocks
    const baseConfidence = Math.min(relevantBlocks.length * 0.1, 0.8);
    const diversityBonus = Math.min(relevantBlocks.length * 0.05, 0.2);

    return Math.min(baseConfidence + diversityBonus, 1);
  }

  private formatSources(relevantBlocks: VendorBlock[]) {
    return relevantBlocks.map((block) => ({
      blockId: block.ui_block.block_id,
      summary: `${block.ui_block.block_id} - ${block.theme.niche} theme`,
      relevance: 0.8, // Fixed relevance for vendor blocks
    }));
  }
}
