import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "rollup-plugin-terser";

export default [
    {
        input: "src/index.js",
        output: [
            {
                file: "dist/commint.esm.js",
                format: "esm",
                sourcemap: true,
            },
            {
                file: "dist/commint.js",
                format: "iife",
                name: "Commint",
                sourcemap: true,
            },
        ],
        plugins: [resolve(), commonjs() /*terser()*/],
    },
];
