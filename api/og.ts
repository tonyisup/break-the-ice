import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImageResponse } from '@vercel/og';
import React from 'react';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const searchParams = url.searchParams;

    // Extract params
    const id = searchParams.get('id');
    let text = searchParams.get('text');
    let styleName = searchParams.get('styleName') || 'General';
    let styleColor = searchParams.get('styleColor') || '#000000';
    let gradientStart = searchParams.get('gradientStart') || '#f0f0f0';
    let gradientEnd = searchParams.get('gradientEnd') || '#d0d0d0';
    let toneName = searchParams.get('toneName') || 'Casual';
    let toneColor = searchParams.get('toneColor') || '#000000';

    if (id) {
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (!convexUrl) {
        throw new Error('NEXT_PUBLIC_CONVEX_URL is not set');
      }
      const convex = new ConvexHttpClient(convexUrl);
      const questionInfo: any = await convex.query(api.questions.getQuestionForOgImage, { id: id as any });
      if (questionInfo) {
        text = questionInfo.text;
        styleName = questionInfo.styleName;
        styleColor = questionInfo.styleColor;
        toneName = questionInfo.toneName;
        toneColor = questionInfo.toneColor;
        gradientStart = questionInfo.gradientStart;
        gradientEnd = questionInfo.gradientEnd;
      }
    }

    if (!text) {
      res.status(400).send('Missing text or id parameter');
      return;
    }

    // Use React.createElement to avoid JSX compilation issues
    const element = React.createElement(
      'div',
      {
        style: {
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'white',
          padding: '40px',
        },
      },
      // Card Container
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            borderRadius: '30px',
            padding: '3px',
            background: `linear-gradient(135deg, ${gradientEnd}, ${gradientStart})`,
          },
        },
        // Inner Content
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '27px',
              padding: '32px',
              justifyContent: 'space-between',
            },
          },
          // Header / Badges
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                width: '100%',
              },
            },
            // Style Badge
            React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(0,0,0,0.1)',
                  padding: '8px 16px',
                  borderRadius: '999px',
                  borderTopWidth: '2px',
                  borderTopStyle: 'solid',
                  borderTopColor: gradientStart,
                  borderLeftWidth: '2px',
                  borderLeftStyle: 'solid',
                  borderLeftColor: gradientStart,
                  gap: '8px',
                },
              },
              // Style icon placeholder
              React.createElement('div', {
                style: { width: '24px', height: '24px', borderRadius: '50%', backgroundColor: styleColor },
              }),
              React.createElement(
                'span',
                { style: { fontSize: '18px', fontWeight: 600, color: '#1f2937' } },
                styleName
              )
            ),
            // Tone Badge
            React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(0,0,0,0.1)',
                  padding: '8px 16px',
                  borderRadius: '999px',
                  borderBottomWidth: '2px',
                  borderBottomStyle: 'solid',
                  borderBottomColor: gradientEnd,
                  borderRightWidth: '2px',
                  borderRightStyle: 'solid',
                  borderRightColor: gradientEnd,
                  gap: '8px',
                },
              },
              // Tone icon placeholder
              React.createElement('div', {
                style: { width: '24px', height: '24px', borderRadius: '50%', backgroundColor: toneColor },
              }),
              React.createElement(
                'span',
                { style: { fontSize: '18px', fontWeight: 600, color: '#1f2937' } },
                toneName
              )
            )
          ),
          // Main Text
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                textAlign: 'center',
              },
            },
            React.createElement(
              'h2',
              {
                style: {
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: '#111827',
                  lineHeight: 1.4,
                  margin: 0,
                },
              },
              text
            )
          ),
          // Footer / Branding
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                opacity: 0.5,
              },
            },
            React.createElement(
              'span',
              { style: { fontSize: '16px', color: '#4b5563' } },
              '@IcebergBreaker'
            )
          )
        )
      )
    );

    const imageResponse = new ImageResponse(element, {
      width: 1200,
      height: 630,
    });

    // Convert the ImageResponse to a buffer and send it
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(buffer);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.log(message);
    res.status(500).send('Failed to generate the image');
  }
}
