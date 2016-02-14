#include <mbgl/shader/shader.hpp>
#include <mbgl/gl/gl.hpp>
#include <mbgl/util/stopwatch.hpp>
#include <mbgl/util/exception.hpp>
#include <mbgl/platform/log.hpp>
#include <mbgl/platform/platform.hpp>

#include <cstring>
#include <cassert>
#include <iostream>
#include <fstream>
#include <cstdio>

using namespace mbgl;

Shader::Shader(const char *name_, const GLchar *vertSource, const GLchar *fragSource)
    : name(name_)
{
    util::stopwatch stopwatch("shader compilation", Event::Shader);

    program.create();

    if (!compileShader(&vertShader, GL_VERTEX_SHADER, &vertSource)) {
        Log::Error(Event::Shader, "Vertex shader %s failed to compile: %s", name, vertSource);
        program.reset();
        throw util::ShaderException(std::string { "Vertex shader " } + name + " failed to compile");
    }

    if (!compileShader(&fragShader, GL_FRAGMENT_SHADER, &fragSource)) {
        Log::Error(Event::Shader, "Fragment shader %s failed to compile: %s", name, fragSource);
        MBGL_CHECK_ERROR(glDeleteShader(vertShader));
        vertShader = 0;
        program.reset();
        throw util::ShaderException(std::string { "Fragment shader " } + name + " failed to compile");
    }

    // Attach shaders
    MBGL_CHECK_ERROR(glAttachShader(program.getID(), vertexShader));
    MBGL_CHECK_ERROR(glAttachShader(program.getID(), fragmentShader));

    {
        // Link program
        GLint status;
        MBGL_CHECK_ERROR(glLinkProgram(program.getID()));

        MBGL_CHECK_ERROR(glGetProgramiv(program.getID(), GL_LINK_STATUS, &status));
        if (status == 0) {
            GLint logLength;
            MBGL_CHECK_ERROR(glGetProgramiv(program.getID(), GL_INFO_LOG_LENGTH, &logLength));
            const auto log = std::make_unique<GLchar[]>(logLength);
            if (logLength > 0) {
                MBGL_CHECK_ERROR(glGetProgramInfoLog(program.getID(), logLength, &logLength, log.get()));
                Log::Error(Event::Shader, "Program failed to link: %s", log.get());
            }

            MBGL_CHECK_ERROR(glDeleteShader(vertShader));
            vertShader = 0;
            MBGL_CHECK_ERROR(glDeleteShader(fragShader));
            fragShader = 0;
            program.reset();
        throw util::ShaderException(std::string { "Program " } + name + " failed to link: " + log.get());
        }
    }

    a_pos = MBGL_CHECK_ERROR(glGetAttribLocation(program.getID(), "a_pos"));
}


bool Shader::compileShader(GLuint *shader, GLenum type, const GLchar *source[]) {
    GLint status;

    *shader = MBGL_CHECK_ERROR(glCreateShader(type));
    const GLsizei lengths = static_cast<GLsizei>(std::strlen(*source));
    MBGL_CHECK_ERROR(glShaderSource(*shader, 1, source, &lengths));

    MBGL_CHECK_ERROR(glCompileShader(*shader));

    MBGL_CHECK_ERROR(glGetShaderiv(*shader, GL_COMPILE_STATUS, &status));
    if (status == 0) {
        GLint logLength;
        MBGL_CHECK_ERROR(glGetShaderiv(*shader, GL_INFO_LOG_LENGTH, &logLength));
        if (logLength > 0) {
            const auto log = std::make_unique<GLchar[]>(logLength);
            MBGL_CHECK_ERROR(glGetShaderInfoLog(*shader, logLength, &logLength, log.get()));
            Log::Error(Event::Shader, "Shader failed to compile: %s", log.get());
        }

        MBGL_CHECK_ERROR(glDeleteShader(*shader));
        *shader = 0;
        return false;
    }

    MBGL_CHECK_ERROR(glGetShaderiv(*shader, GL_COMPILE_STATUS, &status));
    if (status == GL_FALSE) {
        Log::Error(Event::Shader, "Shader %s failed to compile.", name);
        MBGL_CHECK_ERROR(glDeleteShader(*shader));
        *shader = 0;
        return false;
    }

    return true;
}

Shader::~Shader() {
    if (program) {
        MBGL_CHECK_ERROR(glDetachShader(program.getID(), vertexShader));
        MBGL_CHECK_ERROR(glDetachShader(program.getID(), fragmentShader));
        MBGL_CHECK_ERROR(glDeleteShader(vertShader));
        vertShader = 0;
        MBGL_CHECK_ERROR(glDeleteShader(fragShader));
        fragShader = 0;
    }
}
