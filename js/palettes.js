/* Pixeledit — built-in palettes */
'use strict';

const PALETTES = [
  {
    name: 'DawnBringer 32',
    colors: [
      '#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a',
      '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74',
      '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
      '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30',
    ],
  },
  {
    name: 'Endesga 32',
    colors: [
      '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633',
      '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
      '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
      '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569',
    ],
  },
  {
    name: 'PICO-8',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
  },
  {
    name: 'Sweetie 16',
    colors: [
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
    ],
  },
  {
    name: 'DawnBringer 16',
    colors: [
      '#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346524', '#d04648', '#757161',
      '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6',
    ],
  },
  { name: 'SLSO8', colors: ['#0d2b45', '#203c56', '#544e68', '#8d697a', '#d08159', '#ffaa5e', '#ffd4a3', '#ffecd6'] },
  { name: 'Nyx8', colors: ['#08141e', '#0f2a3f', '#20394f', '#4e495f', '#816271', '#997577', '#c3a38a', '#f6d6bd'] },
  { name: 'Ammo-8', colors: ['#040c06', '#112318', '#1e3a29', '#305d42', '#4d8061', '#89a257', '#bedc7f', '#eeffcc'] },
  { name: 'Oil 6', colors: ['#272744', '#494d7e', '#8b6d9c', '#c69fa5', '#f2d3ab', '#fbf5ef'] },
  { name: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { name: '1-bit', colors: ['#000000', '#ffffff'] },
  {
    name: 'Grayscale 16',
    colors: Array.from({ length: 16 }, (_, i) => {
      const v = Math.round((i / 15) * 255).toString(16).padStart(2, '0');
      return '#' + v + v + v;
    }),
  },
];
