cd(ARGS[1]); include(joinpath(ARGS[1], "practice_sets.jl"))
open(ARGS[3], "w") do io
    for s in eachline(ARGS[2])
        r = try string(convert(ChordClass, parse(PointedChord{MusicInterval}, s))) catch e; "ERROR" end
        println(io, s, "\t", r)
    end
end
